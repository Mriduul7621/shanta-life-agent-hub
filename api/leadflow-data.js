/**
 * GET /api/leadflow-data — LeadFlow summary feed (Phase 2, spec §7).
 *
 * Same pattern as api/retail-data.js: the browser never touches
 * LeadFlow's Supabase directly. This serverless function verifies the
 * Hub JWT, queries the LeadFlow Supabase project READ-ONLY with the
 * service_role key (server env only — never VITE_-prefixed, never
 * logged, never in client code), and returns ONLY the computed summary
 * for the caller's visible slice (Hub visibility rule: employee ->
 * own; team_lead -> own + downline; manager -> own + subtree;
 * admin -> org-wide).
 *
 * Counts and aggregates ONLY — no raw lead rows, no customer PII
 * (names, phones) in the response (spec §15.10 default). The fetch
 * allowlist selects only id, current_status, next_follow_up_at,
 * assigned_to, custom_fields (for the assignedTo fallback arm),
 * created_at, is_deleted — customer_name / mobile are never selected.
 *
 * Headline numbers come from exact PostgREST count queries
 * (Prefer: count=exact), so big lead tables stay cheap. Row fetching
 * (bounded at LEADFLOW_FETCH_CAP) exists only for the status
 * breakdown and the member-wise team table; when the fetch is
 * truncated, `truncated: true` is reported.
 *
 * Schema note (spec §15.2): LeadFlow has three divergent schema
 * definitions; the migration chain (001–063) is authoritative and this
 * proxy is built against it. Two columns are treated as OPTIONAL and
 * retried without on a 400: users.subordinates (BFS over manager_id
 * covers scoping) and leads.custom_fields (the assignedTo fallback
 * arm is dropped). Terminal statuses come from the Metadata Engine
 * `options` table (field_key 'FollowUpStatus' / 'lead_status',
 * meta.isTerminal) — the runtime source of truth. The legacy
 * lead_status table (migration 013) has NO meta column, so selecting
 * status_name,meta 400s live (found 2026-11-20); on any failure the
 * statuses fall back to Converted + Not Interested and
 * `terminalFallback: true` is reported.
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
  dhakaDayBounds,
  dhakaTodayIso,
} from './_lib/supabase.js';
import {
  summarizeLeadflow,
  aggregateLeadCounts,
  scopeSetsFor,
  LEADFLOW_FETCH_CAP,
  DEFAULT_TERMINAL,
} from './_lib/leadflowSummary.js';
import { buildLeadflowFixture } from './_lib/demoFixtureLeadflow.js';

export const config = { maxDuration: 30 };

const USERS_CACHE_MS = 5 * 60 * 1000;
const TERMINAL_CACHE_MS = 5 * 60 * 1000;
const CHUNK = 50; // users per PostgREST OR filter
const USERS_FETCH_CAP = 5000;

// Naive timestamps (no zone designator): the LeadFlow columns are
// TIMESTAMP (naive, stored as UTC wall time), so a naive literal
// compares wall-to-wall with no session-timezone involvement.
const naiveIso = (ms) => new Date(ms).toISOString().slice(0, 19);

const demoFixtureEnabled = () =>
  String(process.env.HUB_DEMO_FIXTURE || '').trim().toLowerCase() === 'true';

const isDemoUser = (employeeId) => String(employeeId || '').startsWith('999');

let usersCache = { users: null, fetchedAtMs: 0, hasSubordinates: true };
let terminalCache = { set: null, fetchedAtMs: 0, fallback: false };

function cacheValid(entry, ttl) {
  return entry && Date.now() - entry.fetchedAtMs < ttl;
}

async function fetchUsers(cfg, { withSubordinates = true } = {}) {
  const select = withSubordinates
    ? 'id,employee_id,full_name,subordinates,manager_id'
    : 'id,employee_id,full_name,manager_id';
  const users = [];
  let offset = 0;
  for (;;) {
    const page = await supaGet(cfg, 'users', {
      select,
      order: 'employee_id',
      limit: 1000,
      offset,
    });
    users.push(...page);
    if (page.length < 1000 || users.length >= USERS_FETCH_CAP) break;
    offset += page.length;
  }
  return users;
}

async function getUsers(cfg) {
  if (cacheValid(usersCache, USERS_CACHE_MS) && usersCache.users) return usersCache.users;
  let users;
  let hasSubordinates = true;
  try {
    users = await fetchUsers(cfg, { withSubordinates: true });
  } catch (err) {
    // Drift: the subordinates column is optional — retry without it
    // (BFS over manager_id covers scoping) instead of failing the feed.
    if (err && err.status === 400) {
      hasSubordinates = false;
      users = await fetchUsers(cfg, { withSubordinates: false });
    } else {
      throw err;
    }
  }
  usersCache = { users, fetchedAtMs: Date.now(), hasSubordinates };
  return users;
}

async function getTerminalStatuses(cfg) {
  if (cacheValid(terminalCache, TERMINAL_CACHE_MS) && terminalCache.set) {
    return { set: terminalCache.set, fallback: terminalCache.fallback };
  }
  let set = null;
  let fallback = false;
  try {
    // Metadata Engine options table: type is stored in field_key,
    // status name in option_value, flags in meta. The seed uses
    // 'FollowUpStatus'; the client types still name 'lead_status' —
    // query both keys.
    const rows = await supaGet(cfg, 'options', {
      select: 'option_value,meta',
      filters: { field_key: 'in.(FollowUpStatus,lead_status)' },
    });
    const found = new Set();
    for (const row of rows) {
      const meta = row && typeof row.meta === 'object' ? row.meta : null;
      if (meta && meta.isTerminal === true && row.option_value) found.add(String(row.option_value));
    }
    set = found.size > 0 ? found : null;
    if (!set) fallback = true;
  } catch {
    fallback = true;
  }
  if (!set) set = new Set(DEFAULT_TERMINAL);
  terminalCache = { set, fetchedAtMs: Date.now(), fallback };
  return { set, fallback };
}

function chunkOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

// PostgREST filter for "assigned to one of these users": the
// assigned_to UUID arm plus the custom_fields.assignedTo Employee-ID
// fallback arm (spec §2.4). Returns null for an admin (no filter).
function scopeFilter(uuids, empIds) {
  if (uuids === null) return null;
  if (uuids.length === 0) return { or: '(assigned_to.eq.00000000-0000-0000-0000-000000000000)' };
  const uuidPart = uuids.length > 0 ? `assigned_to.in.(${uuids.join(',')})` : null;
  const empPart = empIds.length > 0 ? `custom_fields->>assignedTo.in.(${empIds.join(',')})` : null;
  const arms = [uuidPart, empPart].filter(Boolean);
  return { or: `(${arms.join(',')})` };
}

function notTerminalFilter(terminal) {
  const names = [...terminal].filter((s) => s && !s.includes(','));
  if (names.length === 0) return {};
  return { 'current_status': `not.in.(${names.join(',')})` };
}

async function countLeads(cfg, scope, extra, state) {
  // scope: [{ uuid, emp }] pairs, or null (admin, no user filter).
  // state.dropCustomFields remembers a drift retry within one request
  // (see fetchScopeRows — the same column is optional in both paths).
  if (scope === null) {
    return supaCount(cfg, 'leads', { 'is_deleted': 'eq.false', ...extra });
  }
  let total = 0;
  for (const chunk of chunkOf(scope)) {
    const uuids = chunk.map((p) => p.uuid);
    const emps = chunk.map((p) => p.emp);
    // Capture per call: countHeadlines runs its queries in parallel,
    // so a shared flag alone would let a second in-flight 400 rethrow
    // after the first one already flipped it.
    const usedFallbackArm = !state.dropCustomFields;
    const filter = usedFallbackArm
      ? scopeFilter(uuids, emps)
      : { or: `(assigned_to.in.(${uuids.join(',')}))` };
    try {
      total += await supaCount(cfg, 'leads', { 'is_deleted': 'eq.false', ...filter, ...extra });
    } catch (err) {
      // Drift: custom_fields is optional — retry without the fallback
      // arm instead of failing the feed. Remember it for the remaining
      // chunks so each one fails only once.
      if (err && err.status === 400 && usedFallbackArm) {
        state.dropCustomFields = true;
        total += await supaCount(cfg, 'leads', {
          'is_deleted': 'eq.false',
          or: `(assigned_to.in.(${uuids.join(',')}))`,
          ...extra,
        });
      } else {
        throw err;
      }
    }
  }
  return total;
}

async function countHeadlines(cfg, scope, bounds, terminal) {
  const { startMs, endMs } = bounds;
  const start = naiveIso(startMs);
  const end = naiveIso(endMs);
  const notTerm = notTerminalFilter(terminal);
  const state = { dropCustomFields: false };
  const [overdue, today, upcoming, total, open, converted, todayCollection] = await Promise.all([
    countLeads(cfg, scope, { 'next_follow_up_at': `lt.${start}`, ...notTerm }, state),
    // Two bounds on one column go through and=(...) — PostgREST has
    // no reliable duplicate-param form for a range.
    countLeads(cfg, scope, { and: `(next_follow_up_at.gte.${start},next_follow_up_at.lt.${end})`, ...notTerm }, state),
    countLeads(cfg, scope, { 'next_follow_up_at': `gte.${end}`, ...notTerm }, state),
    countLeads(cfg, scope, {}, state),
    countLeads(cfg, scope, { ...notTerm }, state),
    countLeads(cfg, scope, { 'current_status': 'eq.Converted' }, state),
    countLeads(cfg, scope, { and: `(created_at.gte.${start},created_at.lt.${end})` }, state),
  ]);
  return {
    followups: { overdue, today, upcoming },
    total,
    open,
    converted,
    todayCollection,
  };
}

async function fetchScopeRows(cfg, scope) {
  // Row fetch for statusCounts + member breakdown, bounded.
  // scope: [{ uuid, emp }] pairs, or null (admin, no user filter).
  const select = 'id,current_status,next_follow_up_at,assigned_to,custom_fields,created_at,is_deleted';
  const rows = [];
  const chunks = scope === null ? [null] : chunkOf(scope);
  let dropCustomFields = false;
  for (const chunk of chunks) {
    if (rows.length >= LEADFLOW_FETCH_CAP) break;
    const filter = chunk === null
      ? {}
      : scopeFilter(
          chunk.map((p) => p.uuid),
          chunk.map((p) => p.emp),
        );
    const uuidOnlyFilter = chunk === null
      ? {}
      : { or: `(assigned_to.in.(${chunk.map((p) => p.uuid).join(',')}))` };
    let offset = 0;
    for (;;) {
      if (rows.length >= LEADFLOW_FETCH_CAP) break;
      const limit = Math.min(1000, LEADFLOW_FETCH_CAP - rows.length);
      let page;
      const useSelect = dropCustomFields ? select.replace(',custom_fields', '') : select;
      const useFilter = dropCustomFields ? uuidOnlyFilter : filter;
      try {
        page = await supaGet(cfg, 'leads', {
          select: useSelect,
          order: 'created_at.desc',
          limit,
          offset,
          filters: { 'is_deleted': 'eq.false', ...useFilter },
        });
      } catch (err) {
        // Drift: custom_fields is optional — retry without the
        // fallback arm instead of failing the feed. Remember it for
        // the remaining pages/chunks so each one fails only once.
        if (err && err.status === 400 && !dropCustomFields) {
          dropCustomFields = true;
          page = await supaGet(cfg, 'leads', {
            select: select.replace(',custom_fields', ''),
            order: 'created_at.desc',
            limit,
            offset,
            filters: { 'is_deleted': 'eq.false', ...uuidOnlyFilter },
          });
        } else {
          throw err;
        }
      }
      rows.push(...page);
      if (page.length < limit) break;
      offset += page.length;
    }
  }
  return rows;
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
    const fixture = buildLeadflowFixture(todayIso);
    const scopes = scopeSetsFor(fixture.users, user.employeeId, user.role);
    if (!scopes) {
      return send(res, 200, {
        demo: true,
        scope: user.role === 'admin' ? 'org' : user.role === 'manager' ? 'subtree' : user.role === 'team_lead' ? 'team' : 'own',
        role: user.role,
        userEmployeeId: user.employeeId,
        userName: null,
        empty: true,
        emptyReason: 'no-leadflow-account',
        followups: { overdue: 0, today: 0, upcoming: 0, all: 0 },
        leads: { total: 0, open: 0, converted: 0, todayCollection: 0, statusCounts: {} },
        team: null,
        terminalFallback: false,
        truncated: false,
        syncedAt: Date.now(),
      });
    }
    const byUuid = new Map(fixture.users.map((u) => [String(u.id), u]));
    const byEmp = new Map(fixture.users.map((u) => [String(u.employee_id).toUpperCase(), u]));
    const ownCounts = aggregateLeadCounts(
      fixture.leads,
      byUuid,
      byEmp,
      scopes.ownUuids,
      scopes.ownEmpIds,
      fixture.terminalStatuses,
      todayIso,
    );
    const teamCounts = aggregateLeadCounts(
      fixture.leads,
      byUuid,
      byEmp,
      scopes.teamUuids,
      scopes.teamEmpIds,
      fixture.terminalStatuses,
      todayIso,
    );
    const summary = summarizeLeadflow(
      {
        users: fixture.users,
        ownCounts,
        teamCounts,
        rows: fixture.leads,
        terminalStatuses: fixture.terminalStatuses,
        terminalFallback: false,
        truncated: false,
      },
      user,
      todayIso,
    );
    summary.demo = true;
    return send(res, 200, summary);
  }

  const cfg = supabaseConfig(process.env, 'LEADFLOW_SUPABASE_URL', 'LEADFLOW_SERVICE_ROLE_KEY');
  if (!cfg) {
    return send(res, 500, { error: 'lead data is not configured' });
  }

  try {
    const users = await getUsers(cfg);
    const { set: terminal, fallback: terminalFallback } = await getTerminalStatuses(cfg);
    const scopes = scopeSetsFor(users, user.employeeId, user.role);
    if (!scopes) {
      return send(res, 200, {
        demo: false,
        scope: user.role === 'admin' ? 'org' : user.role === 'manager' ? 'subtree' : user.role === 'team_lead' ? 'team' : 'own',
        role: user.role,
        userEmployeeId: user.employeeId,
        userName: null,
        empty: true,
        emptyReason: 'no-leadflow-account',
        followups: { overdue: 0, today: 0, upcoming: 0, all: 0 },
        leads: { total: 0, open: 0, converted: 0, todayCollection: 0, statusCounts: {} },
        team: null,
        terminalFallback,
        truncated: false,
        syncedAt: Date.now(),
      });
    }

    const bounds = dhakaDayBounds(todayIso);
    const isAdmin = user.role === 'admin';
    const ownScope = isAdmin ? null : scopes.ownPairs;
    const teamScope = isAdmin || scopes.downline.length === 0 ? null : scopes.teamPairs;

    const ownCounts = await countHeadlines(cfg, ownScope, bounds, terminal);
    const teamCounts = teamScope
      ? await countHeadlines(cfg, teamScope, bounds, terminal)
      : { followups: { overdue: 0, today: 0, upcoming: 0 }, total: 0, open: 0, converted: 0, todayCollection: 0 };

    // Row fetch covers the whole visible set (own + team) so one fetch
    // feeds both the own statusCounts and the member breakdown.
    const visibleScope = isAdmin ? null : [...scopes.ownPairs, ...scopes.teamPairs];
    const rows = await fetchScopeRows(cfg, visibleScope);
    const visibleTotal = isAdmin ? ownCounts.total : ownCounts.total + teamCounts.total;
    const truncated = rows.length < visibleTotal && rows.length >= LEADFLOW_FETCH_CAP;

    const summary = summarizeLeadflow(
      {
        users,
        ownCounts,
        teamCounts,
        rows,
        terminalStatuses: terminal,
        terminalFallback,
        truncated,
      },
      user,
      todayIso,
    );
    summary.demo = false;
    return send(res, 200, summary);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[leadflow-data] failed:', err && err.message ? err.message : 'unknown');
    if (err && err.message && err.message.startsWith('supabase ')) {
      return send(res, 502, { error: 'LeadFlow is not reachable right now' });
    }
    return send(res, 500, { error: 'could not load lead data' });
  }
}
