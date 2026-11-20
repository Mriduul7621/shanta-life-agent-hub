/**
 * GET /api/learning-data — Learning Hub summary feed (Phase 2, spec §8).
 *
 * Same pattern as api/retail-data.js: the browser never touches the
 * Learning Hub's Supabase directly. This serverless function verifies
 * the Hub JWT, queries the Learning Hub Supabase project READ-ONLY
 * with the service_role key (server env only — never VITE_-prefixed,
 * never logged, never in client code), and returns ONLY the computed
 * summary for the caller's visible slice (Hub visibility rule:
 * employee -> own; team_lead -> own + downline; manager -> own +
 * subtree; admin -> org-wide).
 *
 * Counts and aggregates ONLY — no per-learner PII beyond the caller's
 * own progress and their direct reports' names + progress (spec
 * §8.2). The fetch allowlist selects only the columns the summarizer
 * needs; no email, phone, DOB, or credential column is ever selected.
 *
 * Row fetching is bounded (LEARNING_FETCH_CAP per table); when the
 * module_progress fetch is truncated, `truncated: true` is reported.
 * Downline resolution: the team_employee_ids RPC primary, BFS over
 * supervisor_id fallback (spec §6.2) — an RPC failure degrades to
 * the BFS, never to an error.
 *
 * Demo: when HUB_DEMO_FIXTURE=true AND the caller is a 999xxxx demo
 * user, a synthetic fixture slice is summarized instead (same
 * summarizer as live data). NO VERCEL_ENV check — this project's
 * deployments run on the production target, so VERCEL_ENV is always
 * 'production' here and such a check silently disables the fixture
 * (live bug 2026-11-20). The real production lock is the
 * vite.config build guard: a HUB_BUILD_TARGET=production build FAILS
 * with the flag set.
 */

import { verifySsoTokenNode, publicKeyConfig } from './_lib/verifyJwt.js';
import {
  supabaseConfig,
  supaGet,
  supaCount,
  supaRpc,
  dhakaTodayIso,
} from './_lib/supabase.js';
import {
  summarizeLearning,
  resolveLearningDownline,
} from './_lib/learningSummary.js';
import { buildLearningFixture } from './_lib/demoFixtureLearning.js';

export const config = { maxDuration: 30 };

const STATIC_CACHE_MS = 5 * 60 * 1000;
const CHUNK = 50; // employee IDs per PostgREST .in filter
const EMPLOYEES_FETCH_CAP = 5000;
const LEARNING_FETCH_CAP = 5000; // spec §8.1 step 4

const demoFixtureEnabled = () =>
  String(process.env.HUB_DEMO_FIXTURE || '').trim().toLowerCase() === 'true';

const isDemoUser = (employeeId) => String(employeeId || '').startsWith('999');

let employeesCache = { rows: null, fetchedAtMs: 0 };
let modulesCache = { rows: null, fetchedAtMs: 0 };
let coursesCache = { rows: null, fetchedAtMs: 0 };

function cacheValid(entry) {
  return entry && entry.rows && Date.now() - entry.fetchedAtMs < STATIC_CACHE_MS;
}

async function getEmployees(cfg) {
  if (cacheValid(employeesCache)) return employeesCache.rows;
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await supaGet(cfg, 'employees', {
      select: 'employee_id,full_name,designation,supervisor_id,is_active',
      order: 'employee_id',
      limit: 1000,
      offset,
    });
    rows.push(...page);
    if (page.length < 1000 || rows.length >= EMPLOYEES_FETCH_CAP) break;
    offset += page.length;
  }
  employeesCache = { rows, fetchedAtMs: Date.now() };
  return rows;
}

async function getCourseModules(cfg) {
  if (cacheValid(modulesCache)) return modulesCache.rows;
  const rows = await supaGet(cfg, 'course_modules', {
    select: 'course_id,module_key,title,sort_order',
    order: 'course_id,sort_order',
    limit: 5000,
  });
  modulesCache = { rows, fetchedAtMs: Date.now() };
  return rows;
}

async function getCourses(cfg) {
  if (cacheValid(coursesCache)) return coursesCache.rows;
  const rows = await supaGet(cfg, 'courses', {
    select: 'id,title,title_bn,is_published',
    filters: { 'is_published': 'eq.true' },
    limit: 1000,
  });
  coursesCache = { rows, fetchedAtMs: Date.now() };
  return rows;
}

function chunkOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

// Fetch rows for a set of employee IDs (chunked .in filter), paged,
// bounded at LEARNING_FETCH_CAP. `employeeIds` null = no filter
// (admin, org-wide). Returns { rows, truncated } — truncation is
// decided against an exact count query so it is precise, not guessed.
async function fetchScopedRows(cfg, table, select, employeeIds, order) {
  const chunks = employeeIds === null ? [null] : chunkOf(employeeIds);
  let total = 0;
  for (const chunk of chunks) {
    const filter = chunk === null ? {} : { 'employee_id': `in.(${chunk.join(',')})` };
    // Count on employee_id — every scoped table has it, and the
    // credit_balances view has no id column.
    total += await supaCount(cfg, table, filter, 'employee_id');
  }
  const rows = [];
  for (const chunk of chunks) {
    if (rows.length >= LEARNING_FETCH_CAP) break;
    const filter = chunk === null ? {} : { 'employee_id': `in.(${chunk.join(',')})` };
    let offset = 0;
    for (;;) {
      if (rows.length >= LEARNING_FETCH_CAP) break;
      const limit = Math.min(1000, LEARNING_FETCH_CAP - rows.length);
      const page = await supaGet(cfg, table, {
        select,
        order,
        limit,
        offset,
        filters: filter,
      });
      rows.push(...page);
      if (page.length < limit) break;
      offset += page.length;
    }
  }
  return { rows, truncated: rows.length < total };
}

function normalizeRpcIds(data) {
  if (!Array.isArray(data)) return null;
  const out = [];
  for (const item of data) {
    if (typeof item === 'string' && item) out.push(item);
    else if (item && typeof item === 'object') {
      const v = item.employee_id || item.team_employee_ids || Object.values(item).find((x) => typeof x === 'string');
      if (v) out.push(String(v));
    }
  }
  return out;
}

async function getDownlineIds(cfg, employeeId) {
  try {
    const data = await supaRpc(cfg, 'team_employee_ids', { root: employeeId });
    const ids = normalizeRpcIds(data);
    return ids && ids.length > 0 ? ids : null;
  } catch {
    // RPC failure degrades to the BFS fallback in the summarizer.
    return null;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const claims = token ? verifySsoTokenNode(token, publicKeyConfig()) : null;
  if (!claims) return send(res, 401, { error: 'invalid or expired session' });
  // The verifier guarantees sub (non-empty) + role (one of the four).
  const user = { employeeId: claims.sub, role: claims.role, name: claims.name };

  const todayIso = dhakaTodayIso();

  // Demo fixture: synthetic slice through the SAME summarizer.
  if (demoFixtureEnabled() && isDemoUser(user.employeeId)) {
    const fixture = buildLearningFixture(todayIso);
    const summary = summarizeLearning(
      { ...fixture, downlineIds: null, truncated: false },
      user,
    );
    summary.demo = true;
    return send(res, 200, summary);
  }

  const cfg = supabaseConfig(process.env, 'LEARNINGHUB_SUPABASE_URL', 'LEARNINGHUB_SERVICE_ROLE_KEY');
  if (!cfg) {
    return send(res, 500, { error: 'learning data is not configured' });
  }

  try {
    const employees = await getEmployees(cfg);
    const caller = employees.find(
      (e) => String(e.employee_id || '').trim().toUpperCase() === String(user.employeeId).trim().toUpperCase(),
    );
    if (!caller || caller.is_active === false) {
      return send(res, 200, {
        demo: false,
        scope: user.role === 'admin' ? 'org' : user.role === 'manager' ? 'subtree' : user.role === 'team_lead' ? 'team' : 'own',
        role: user.role,
        userEmployeeId: user.employeeId,
        userName: caller ? String(caller.full_name || '') : null,
        empty: true,
        emptyReason: 'no-lms-record',
        learning: { currentCourse: null, coursesEnrolled: 0, coursesCompleted: 0, certificates: 0, creditBalance: 0 },
        team: null,
        truncated: false,
        syncedAt: Date.now(),
      });
    }

    const isAdmin = user.role === 'admin';
    let visibleIds = null; // admin: no filter
    let downlineIds = null;
    if (!isAdmin) {
      downlineIds = await getDownlineIds(cfg, caller.employee_id);
      const { downline } = resolveLearningDownline(employees, caller, downlineIds);
      visibleIds = [String(caller.employee_id), ...downline.map((e) => String(e.employee_id))];
    }

    const [courseModules, courses, progress, enrollments, certificates, creditBalances] = await Promise.all([
      getCourseModules(cfg),
      getCourses(cfg),
      fetchScopedRows(cfg, 'module_progress', 'employee_id,course_id,module_key,read_done,quiz_passed,best_score,attempts,updated_at', visibleIds, 'updated_at.desc'),
      fetchScopedRows(cfg, 'enrollments', 'employee_id,course_id,status,completed_at', visibleIds, 'employee_id'),
      fetchScopedRows(cfg, 'certificates', 'employee_id,course_id,certificate_no,final_score,issued_at', visibleIds, 'employee_id'),
      fetchScopedRows(cfg, 'credit_balances', 'employee_id,balance', visibleIds, 'employee_id'),
    ]);

    const summary = summarizeLearning(
      {
        employees,
        moduleProgress: progress.rows,
        courseModules,
        courses,
        enrollments: enrollments.rows,
        certificates: certificates.rows,
        creditBalances: creditBalances.rows,
        downlineIds,
        truncated: progress.truncated || enrollments.truncated || certificates.truncated || creditBalances.truncated,
      },
      user,
    );
    summary.demo = false;
    return send(res, 200, summary);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[learning-data] failed:', err && err.message ? err.message : 'unknown');
    if (err && err.message && err.message.startsWith('supabase ')) {
      return send(res, 502, { error: 'Learning Hub is not reachable right now' });
    }
    return send(res, 500, { error: 'could not load learning data' });
  }
}
