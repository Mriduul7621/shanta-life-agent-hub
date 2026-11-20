/**
 * Learning Hub — live data + proxy + fixture check (Node, no browser).
 *
 * Usage: `npm run qa:learning-live`.
 *
 * Mirrors scripts/qa-retail-live.mjs for the Learning feed
 * (api/learning-data.js + api/_lib/learningSummary.js). The in-browser
 * QA cannot exercise the live fetch (no external network in headless
 * Chrome, no /api proxy under file://), so this script runs the Hub's
 * OWN production code against the live Learning Hub Supabase project
 * from Node, where the fetch works.
 *
 * Sections:
 *  1. Live introspection + live handler (SKIPPED without env vars):
 *     reads LEARNINGHUB_SUPABASE_URL + LEARNINGHUB_SERVICE_ROLE_KEY
 *     from process.env or the local .env (never printed, never
 *     committed). Introspects the LIVE Learning Hub columns, calls the
 *     team_employee_ids RPC, then calls the real handler for
 *     dynamically picked real users and checks scoping invariants +
 *     the no-PII rule (responses carry only the spec's allowed fields
 *     — no email/phone/DOB/password keys, no canary values).
 *     Without the vars this section SKIPs gracefully (exit 0) — live
 *     verification then runs post-push against the deployed preview,
 *     where the vars exist.
 *  2. Demo fixture: the synthetic slice's hand-computed values, exact.
 *     Pinned to 2026-11-20 (FIXTURE_TODAY) so the expectations are
 *     deterministic.
 *  2b. Time-frame filter (fixture, pinned date): enrolled/completed/
 *     credits in period per window (hand-computed org + employee
 *     values, independent recomputation from the raw rows),
 *     including 'today' (the new default) and custom ranges;
 *     snapshots (certificates, balances, current course) never move;
 *     boundary dates via hand-built inputs (window start inclusive,
 *     end exclusive; a completion at exactly endMs is out).
 *  3. Key match: the DEV public key PEM + kid bundled in the proxy
 *     (api/_lib/verifyJwt.js) must equal the browser's copy
 *     (src/auth/keys.ts).
 *  4. Proxy handler: the real handler with a PostgREST stub serving
 *     the fixture rows (plus stub-only real users) and ephemeral-key
 *     JWTs — 401s, 405, demo fixture gating (flag on/off, production
 *     env), live-path scoping, no-PII canaries in the stub rows, the
 *     RPC-failure BFS fallback, and the inactive-employee empty state.
 *     Period handling: invalid period -> 400, demo + live paths
 *     honour ?period= (the stub serves credit_ledger rows too); the
 *     default period is Today; custom ranges return exactly the rows
 *     inside them and invalid custom ranges -> 400.
 *
 * Read-only: SELECTs only against Learning Hub Supabase, no writes.
 * The proxy section never touches the network (stubbed fetch). Exits
 * non-zero if any check fails.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dhakaTodayIso } from '../api/_lib/supabase.js';
import { summarizeLearning } from '../api/_lib/learningSummary.js';
import { buildLearningFixture, COURSE_A_ID, COURSE_B_ID } from '../api/_lib/demoFixtureLearning.js';
import { periodMsWindow, periodDateWindow } from '../api/_lib/periods.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE_TODAY = '2026-11-20';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, detail = '') {
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---- Env (process.env first, then the local .env — never printed) ----
function loadEnv() {
  const out = {};
  for (const k of ['LEARNINGHUB_SUPABASE_URL', 'LEARNINGHUB_SERVICE_ROLE_KEY']) {
    if (process.env[k]) out[k] = process.env[k];
  }
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if ((k === 'LEARNINGHUB_SUPABASE_URL' || k === 'LEARNINGHUB_SERVICE_ROLE_KEY') && !out[k]) {
        out[k] = v.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return out;
}
const env = loadEnv();
const hasLive = Boolean(env.LEARNINGHUB_SUPABASE_URL && env.LEARNINGHUB_SERVICE_ROLE_KEY);

// Ephemeral keypair for test JWTs (live + stub sections share it).
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPem = publicKey.export({ type: 'spki', format: 'pem' });
const testKid = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
process.env.HUB_PUBLIC_KEY_PEM = testPem;
process.env.HUB_KID = testKid;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function signToken(claims, { kid = testKid, alg = 'RS256', expired = false } = {}) {
  const head = b64url(JSON.stringify({ alg, typ: 'JWT', kid }));
  const iat = Math.floor(Date.now() / 1000) - (expired ? 7200 : 0);
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + 3600, iss: 'shanta-life-agent-hub' }));
  const input = `${head}.${body}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
  return `${input}.${b64url(sig)}`;
}

const mockReq = ({ method = 'GET', token = null, url = '/api/learning-data' } = {}) => ({
  method,
  url,
  headers: token ? { authorization: `Bearer ${token}` } : {},
});
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.end = (b) => {
    res.body = b;
  };
  return res;
}
async function callHandler(handler, req) {
  const res = mockRes();
  await handler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    /* ignore */
  }
  return { res, json };
}

// ---- 1. Live introspection + live handler (skipped without env) ----
let liveAdmin = null;
if (!hasLive) {
  skip('live Learning Hub introspection', 'LEARNINGHUB_SUPABASE_URL / LEARNINGHUB_SERVICE_ROLE_KEY not set — live verification runs post-push');
  skip('live Learning Hub handler', 'no env vars (see above)');
} else {
  process.env.LEARNINGHUB_SUPABASE_URL = env.LEARNINGHUB_SUPABASE_URL;
  process.env.LEARNINGHUB_SERVICE_ROLE_KEY = env.LEARNINGHUB_SERVICE_ROLE_KEY;
  const base = env.LEARNINGHUB_SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: env.LEARNINGHUB_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.LEARNINGHUB_SERVICE_ROLE_KEY}`,
  };
  async function probe(table) {
    const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, status: res.status, columns: [] };
    const rows = await res.json();
    return { ok: true, status: 200, columns: rows.length > 0 ? Object.keys(rows[0]) : [] };
  }
  const required = {
    employees: ['employee_id', 'full_name', 'designation', 'supervisor_id', 'is_active'],
    // NOTE: module_progress has NO module_key live (it keys modules by
    // module_id) — the proxy does not select it (live finding 2026-11-20).
    module_progress: ['employee_id', 'course_id', 'read_done', 'quiz_passed', 'best_score', 'attempts', 'updated_at'],
    course_modules: ['course_id', 'module_key', 'title', 'sort_order'],
    courses: ['id', 'title', 'title_bn', 'is_published'],
    enrollments: ['employee_id', 'course_id', 'status', 'enrolled_at', 'completed_at'],
    certificates: ['employee_id', 'course_id', 'certificate_no', 'final_score', 'issued_at'],
    credit_balances: ['employee_id', 'balance'],
    // Period credits read the ledger (read-only, summary-only).
    credit_ledger: ['employee_id', 'points', 'created_at'],
  };
  for (const [table, cols] of Object.entries(required)) {
    const p = await probe(table);
    check(`live ${table} readable`, p.ok, `HTTP ${p.status}`);
    if (p.ok) {
      for (const col of cols) {
        check(`live ${table} column: ${col}`, p.columns.includes(col), p.columns.length > 0 ? '' : '(no rows returned — columns unverifiable)');
      }
    }
  }

  // Dynamic picks: first employee with direct reports + first without.
  const empRes = await fetch(`${base}/rest/v1/employees?select=employee_id,full_name,designation,supervisor_id,is_active&order=employee_id&limit=1000`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const liveEmployees = empRes.ok ? await empRes.json() : [];
  check('live employees list fetched', Array.isArray(liveEmployees) && liveEmployees.length > 0, `${liveEmployees.length} employees`);
  const supervisorIds = new Set(liveEmployees.map((e) => String(e.supervisor_id || '')).filter(Boolean));
  const leadEmp = liveEmployees.find((e) => supervisorIds.has(String(e.employee_id))) || null;
  const soloEmp = liveEmployees.find((e) => !supervisorIds.has(String(e.employee_id))) || null;
  console.log(`INFO  live team-lead pick: ${leadEmp?.employee_id ?? '(none)'} · employee pick: ${soloEmp?.employee_id ?? '(none)'}`);

  // RPC check with the team-lead pick (or the first employee).
  const rpcRoot = (leadEmp || liveEmployees[0])?.employee_id;
  if (rpcRoot) {
    const rpcRes = await fetch(`${base}/rest/v1/rpc/team_employee_ids`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: rpcRoot }),
      signal: AbortSignal.timeout(30000),
    });
    check('live team_employee_ids RPC callable', rpcRes.ok, `HTTP ${rpcRes.status}`);
    if (rpcRes.ok) {
      const ids = await rpcRes.json();
      check('live team_employee_ids returns an array', Array.isArray(ids), `${Array.isArray(ids) ? ids.length : typeof ids} ids`);
    }
  } else {
    skip('live team_employee_ids RPC', 'no employees found');
  }

  delete process.env.HUB_DEMO_FIXTURE;
  const { default: liveHandler } = await import('../api/learning-data.js?live=1');
  const bodies = [];
  if (leadEmp) {
    const t = signToken({ sub: leadEmp.employee_id, name: leadEmp.full_name || 'X', role: 'admin' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    liveAdmin = json;
    bodies.push(res.body);
    check('live admin: 200, org scope, demo:false', res.statusCode === 200 && json?.scope === 'org' && json?.demo === false, `status=${res.statusCode} scope=${json?.scope}`);
    console.log(`INFO  live org — enrolled ${json?.learning?.coursesEnrolled} · completed ${json?.learning?.coursesCompleted} · certificates ${json?.learning?.certificates} · credits ${json?.learning?.creditBalance} · truncated=${json?.truncated}`);
  } else {
    skip('live admin org summary', 'no employee with direct reports found');
  }
  if (leadEmp) {
    const t = signToken({ sub: leadEmp.employee_id, name: leadEmp.full_name || 'X', role: 'team_lead' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live team_lead: 200, team scope, teamSize > 0', res.statusCode === 200 && json?.scope === 'team' && (json?.team?.teamSize ?? 0) > 0, `status=${res.statusCode} teamSize=${json?.team?.teamSize}`);
    check('live team_lead: avgProgress 0–100', typeof json?.team?.avgProgress === 'number' && json.team.avgProgress >= 0 && json.team.avgProgress <= 100, String(json?.team?.avgProgress));
  } else {
    skip('live team_lead scoping', 'no employee with direct reports found');
  }
  if (soloEmp) {
    const t = signToken({ sub: soloEmp.employee_id, name: soloEmp.full_name || 'X', role: 'employee' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live employee: 200, own scope, team null', res.statusCode === 200 && json?.scope === 'own' && json?.team === null, `status=${res.statusCode} scope=${json?.scope}`);
  } else {
    skip('live employee scoping', 'no employee without direct reports found');
  }
  {
    const t = signToken({ sub: '0000000', name: 'Nobody', role: 'employee' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live unknown user: empty, no-lms-record', res.statusCode === 200 && json?.empty === true && json?.emptyReason === 'no-lms-record', `empty=${json?.empty} reason=${json?.emptyReason}`);
  }
  {
    const joined = bodies.join('\n');
    const forbidden = ['"email"', '"phone"', '"mobile"', '"password"', '"pin"', '"dob"', '"date_of_birth"', '"supervisor_id"'];
    const found = forbidden.filter((k) => joined.includes(k));
    check('live no-PII: no forbidden keys in any response', found.length === 0, found.length > 0 ? found.join(',') : `${bodies.length} responses checked`);
  }
}

// ---- 2. Demo fixture exact values (pinned date) ----
function summarizeFixture(employeeId, role, overrides = {}) {
  const fixture = buildLearningFixture(FIXTURE_TODAY);
  return summarizeLearning(
    { ...fixture, downlineIds: overrides.downlineIds ?? null, truncated: false, ...overrides.fixture },
    { employeeId, role },
  );
}
{
  const emp = summarizeFixture('9990001', 'employee');
  check('fixture emp current course A 60% (12/20)', emp.learning.currentCourse?.courseId === COURSE_A_ID && emp.learning.currentCourse?.percent === 60 && emp.learning.currentCourse?.modulesDone === 12 && emp.learning.currentCourse?.modulesTotal === 20, JSON.stringify(emp.learning.currentCourse));
  check('fixture emp enrolled 1 (unpublished C excluded)', emp.learning.coursesEnrolled === 1, String(emp.learning.coursesEnrolled));
  check('fixture emp completed 0 certs 0 credits 85', emp.learning.coursesCompleted === 0 && emp.learning.certificates === 0 && emp.learning.creditBalance === 85, JSON.stringify(emp.learning));
  check('fixture emp team null, scope own', emp.team === null && emp.scope === 'own' && emp.empty === false, `${emp.scope} empty=${emp.empty}`);

  const lead = summarizeFixture('9990002', 'team_lead');
  check('fixture lead own 80% (16/20), enrolled 1, credits 120', lead.learning.currentCourse?.percent === 80 && lead.learning.currentCourse?.modulesDone === 16 && lead.learning.coursesEnrolled === 1 && lead.learning.creditBalance === 120, JSON.stringify(lead.learning));
  check('fixture lead team avg 45, 5 learning, teamSize 5, direct 5', lead.team.avgProgress === 45 && lead.team.learningMembersCount === 5 && lead.team.teamSize === 5 && lead.team.directCount === 5, JSON.stringify({ avg: lead.team.avgProgress, learning: lead.team.learningMembersCount, size: lead.team.teamSize, direct: lead.team.directCount }));
  check(
    'fixture lead members 9990001/11/12/14/15 by % desc',
    lead.team.members.map((m) => m.employeeId).join(',') === '9990001,9990011,9990012,9990014,9990015' &&
      lead.team.members.map((m) => m.overallPercent).join(',') === '60,50,45,40,30' &&
      lead.team.members.map((m) => m.credit).join(',') === '85,40,30,25,15',
    JSON.stringify(lead.team.members),
  );
  check('fixture lead scope team', lead.scope === 'team', lead.scope);

  const mgr = summarizeFixture('9990003', 'manager');
  check('fixture mgr own: no course, enrolled 0, credits 200', mgr.learning.currentCourse === null && mgr.learning.coursesEnrolled === 0 && mgr.learning.coursesCompleted === 0 && mgr.learning.certificates === 0 && mgr.learning.creditBalance === 200, JSON.stringify(mgr.learning));
  check('fixture mgr team avg 52, 23 learning, teamSize 29, direct 23', mgr.team.avgProgress === 52 && mgr.team.learningMembersCount === 23 && mgr.team.teamSize === 29 && mgr.team.directCount === 23, JSON.stringify({ avg: mgr.team.avgProgress, learning: mgr.team.learningMembersCount, size: mgr.team.teamSize, direct: mgr.team.directCount }));
  check(
    'fixture mgr members: 9990002 first (80%), 9990039 last (30%), 23 total',
    mgr.team.members.length === 23 && mgr.team.members[0].employeeId === '9990002' && mgr.team.members[0].overallPercent === 80 && mgr.team.members[22].employeeId === '9990039' && mgr.team.members[22].overallPercent === 30,
    `first=${mgr.team.members[0]?.employeeId} last=${mgr.team.members[22]?.employeeId} n=${mgr.team.members.length}`,
  );
  check('fixture mgr scope subtree', mgr.scope === 'subtree', mgr.scope);

  const adm = summarizeFixture('9990004', 'admin');
  check('fixture admin org enrolled 30 completed 1 certs 1 credits 690', adm.learning.coursesEnrolled === 30 && adm.learning.coursesCompleted === 1 && adm.learning.certificates === 1 && adm.learning.creditBalance === 690 && adm.learning.currentCourse === null, JSON.stringify(adm.learning));
  check('fixture admin team null, scope org', adm.team === null && adm.scope === 'org', adm.scope);

  const unknown = summarizeFixture('9990099', 'employee');
  check('fixture unknown user: empty, no-lms-record', unknown.empty === true && unknown.emptyReason === 'no-lms-record', `empty=${unknown.empty} reason=${unknown.emptyReason}`);

  // Inactive employee record -> empty, NOT an error (spec §8.1 step 1).
  const inactiveFixture = buildLearningFixture(FIXTURE_TODAY);
  inactiveFixture.employees.find((e) => e.employee_id === '9990001').is_active = false;
  const inactive = summarizeLearning({ ...inactiveFixture, downlineIds: null, truncated: false }, { employeeId: '9990001', role: 'employee' });
  check('fixture inactive employee: empty, no-lms-record', inactive.empty === true && inactive.emptyReason === 'no-lms-record', `empty=${inactive.empty} reason=${inactive.emptyReason}`);

  // RPC-primary downline: explicit RPC ids win over the BFS.
  const rpcLead = summarizeFixture('9990002', 'team_lead', { downlineIds: ['9990001', '9990011'] });
  check('fixture RPC downline primary: teamSize 2', rpcLead.team.teamSize === 2, String(rpcLead.team.teamSize));

  // Course B is completed only by the admin — assert it via the admin
  // org totals, and that the manager's own learning stays 0.
  check('fixture course B id is distinct from A', COURSE_A_ID !== COURSE_B_ID, '');
}

// ---- 2b. Time-frame filter (fixture, pinned date) ----
function summarizeFixturePeriod(employeeId, role, period, customRange = null) {
  const fixture = buildLearningFixture(FIXTURE_TODAY);
  return summarizeLearning(
    {
      ...fixture,
      creditLedger: fixture.creditLedger,
      downlineIds: null,
      truncated: false,
      period,
      periodWindow: periodDateWindow(period, FIXTURE_TODAY, customRange),
      periodWindowMs: periodMsWindow(period, FIXTURE_TODAY, customRange),
    },
    { employeeId, role },
  );
}
{
  // Hand-computed org values (see api/_lib/demoFixtureLearning.js):
  // enrolments cycle ages [today, 40, 100, 200, 300] days + the course
  // B enrolment at 110 days; the single completion is 100 days back;
  // ledger rows mirror the balances at cycled ages.
  const orgExpected = {
    'today': { enrolled: 6, completed: 0, credits: 140 },
    'this-month': { enrolled: 6, completed: 0, credits: 140 },
    '3m': { enrolled: 12, completed: 0, credits: 290 },
    '6m': { enrolled: 19, completed: 1, credits: 535 },
    'this-year': { enrolled: 30, completed: 1, credits: 690 },
    'all': { enrolled: 30, completed: 1, credits: 690 },
  };
  for (const [period, exp] of Object.entries(orgExpected)) {
    const s = summarizeFixturePeriod('9990004', 'admin', period);
    check(`period ${period}: org enrolledInPeriod ${exp.enrolled}`, s.learning.enrolledInPeriod === exp.enrolled, String(s.learning.enrolledInPeriod));
    check(`period ${period}: org completedInPeriod ${exp.completed}`, s.learning.completedInPeriod === exp.completed, String(s.learning.completedInPeriod));
    check(`period ${period}: org creditsInPeriod ${exp.credits}`, s.learning.creditsInPeriod === exp.credits, String(s.learning.creditsInPeriod));
    check(`period ${period}: org snapshots stay 30/1/1/690`, s.learning.coursesEnrolled === 30 && s.learning.coursesCompleted === 1 && s.learning.certificates === 1 && s.learning.creditBalance === 690, JSON.stringify(s.learning));
    const w = periodDateWindow(period, FIXTURE_TODAY);
    check(`period ${period}: echoes period + window`, s.period === period && JSON.stringify(s.periodWindow) === JSON.stringify(w), `${s.period} ${JSON.stringify(s.periodWindow)}`);
  }

  // Employee 9990002 (team_lead, own learning): enrolled 40 days back
  // with its 120 ledger credits the same day — both move at 3m.
  // (Note: Object.entries on the numeric-like employee keys iterates
  // in NUMERIC order, so the cycle assigns 9990002 age 40, 9990005
  // age 100, 9990011 age 200 — verified above, not assumed.)
  const empExpected = {
    'today': { enrolled: 0, credits: 0 },
    'this-month': { enrolled: 0, credits: 0 },
    '3m': { enrolled: 1, credits: 120 },
    '6m': { enrolled: 1, credits: 120 },
    'this-year': { enrolled: 1, credits: 120 },
    'all': { enrolled: 1, credits: 120 },
  };
  for (const [period, exp] of Object.entries(empExpected)) {
    const s = summarizeFixturePeriod('9990002', 'team_lead', period);
    check(`period ${period}: emp 9990002 enrolledInPeriod ${exp.enrolled}`, s.learning.enrolledInPeriod === exp.enrolled, String(s.learning.enrolledInPeriod));
    check(`period ${period}: emp 9990002 creditsInPeriod ${exp.credits}`, s.learning.creditsInPeriod === exp.credits, String(s.learning.creditsInPeriod));
    check(`period ${period}: emp 9990002 snapshots stay 1/0/120`, s.learning.coursesEnrolled === 1 && s.learning.coursesCompleted === 0 && s.learning.creditBalance === 120, JSON.stringify(s.learning));
  }

  // Independent recomputation from the raw fixture rows (org):
  // enrolments by enrolled_at, credits by ledger created_at.
  const fixture = buildLearningFixture(FIXTURE_TODAY);
  const publishedIds = new Set(fixture.courses.filter((c) => c.is_published).map((c) => String(c.id)));
  for (const period of ['today', 'this-month', '3m', '6m', 'this-year', 'all']) {
    const w = periodMsWindow(period, FIXTURE_TODAY);
    const inWindow = (iso) => {
      if (w === null) return true;
      const ms = Date.parse(iso);
      return ms >= w.startMs && ms < w.endMs;
    };
    const enrolledExp = fixture.enrollments.filter((e) => publishedIds.has(String(e.course_id)) && inWindow(e.enrolled_at)).length;
    const creditsExp = fixture.creditLedger.filter((r) => inWindow(r.created_at)).reduce((a, r) => a + Number(r.points), 0);
    const s = summarizeFixturePeriod('9990004', 'admin', period);
    check(`period ${period}: recomputed org enrolled matches`, s.learning.enrolledInPeriod === enrolledExp, `${s.learning.enrolledInPeriod} vs ${enrolledExp}`);
    check(`period ${period}: recomputed org credits match`, s.learning.creditsInPeriod === creditsExp, `${s.learning.creditsInPeriod} vs ${creditsExp}`);
  }

  // Custom ranges: [today, today] is the today window (org 6/0/140);
  // [3m start, today] equals the 3m window (org 12/0/290) —
  // recomputed from the raw rows.
  for (const [from, to, enrolledExp, creditsExp] of [
    ['2026-11-20', '2026-11-20', 6, 140],
    ['2026-08-20', '2026-11-20', 12, 290],
  ]) {
    const range = { start: from, end: to };
    const w = periodMsWindow('custom', FIXTURE_TODAY, range);
    const inWindow = (iso) => {
      const ms = Date.parse(iso);
      return ms >= w.startMs && ms < w.endMs;
    };
    const enrolledRows = fixture.enrollments.filter((e) => publishedIds.has(String(e.course_id)) && inWindow(e.enrolled_at)).length;
    const creditsRows = fixture.creditLedger.filter((r) => inWindow(r.created_at)).reduce((a, r) => a + Number(r.points), 0);
    const s = summarizeFixturePeriod('9990004', 'admin', 'custom', range);
    check(`custom ${from}..${to}: org enrolled ${enrolledExp}`, s.learning.enrolledInPeriod === enrolledExp && s.learning.enrolledInPeriod === enrolledRows, `${s.learning.enrolledInPeriod} vs ${enrolledRows}`);
    check(`custom ${from}..${to}: org credits ${creditsExp}`, s.learning.creditsInPeriod === creditsExp && s.learning.creditsInPeriod === creditsRows, `${s.learning.creditsInPeriod} vs ${creditsRows}`);
    check(`custom ${from}..${to}: echoes period + window`, s.period === 'custom' && s.periodWindow?.start === from && s.periodWindow?.end === to, `${s.period} ${JSON.stringify(s.periodWindow)}`);
  }

  // Boundary dates via hand-built inputs. 3m window pinned 2026-11-20:
  // [2026-08-19T18:00Z, 2026-11-20T18:00Z). Course A: enrolled exactly
  // at the start (in), 100% done via progress updated today (completion
  // in). Course B: enrolled 1ms before the start (out), completed_at
  // exactly at the end (out — half-open). Ledger: +50 at the start (in),
  // +30 1ms before (out), −10 today (in) → net 40 in-window, balance 70.
  {
    const emp = { employee_id: '2025001', full_name: 'Boundary Agent', designation: 'Field Associate', supervisor_id: null, is_active: true };
    const input = {
      employees: [emp],
      moduleProgress: [
        { employee_id: '2025001', course_id: COURSE_A_ID, read_done: true, quiz_passed: false, updated_at: '2026-11-20T03:00:00Z' },
        { employee_id: '2025001', course_id: COURSE_B_ID, read_done: true, quiz_passed: false, updated_at: '2026-11-20T03:00:00Z' },
      ],
      courseModules: [
        { course_id: COURSE_A_ID, module_key: 'a-1', title: 'Module 1', sort_order: 1 },
        { course_id: COURSE_B_ID, module_key: 'b-1', title: 'Module 1', sort_order: 1 },
      ],
      courses: [
        { id: COURSE_A_ID, title: 'Course A', title_bn: null, is_published: true },
        { id: COURSE_B_ID, title: 'Course B', title_bn: null, is_published: true },
      ],
      enrollments: [
        { employee_id: '2025001', course_id: COURSE_A_ID, status: 'enrolled', enrolled_at: '2026-08-19T18:00:00.000Z', completed_at: null },
        { employee_id: '2025001', course_id: COURSE_B_ID, status: 'completed', enrolled_at: '2026-08-19T17:59:59.999Z', completed_at: '2026-11-20T18:00:00.000Z' },
      ],
      certificates: [],
      creditBalances: [{ employee_id: '2025001', balance: 70 }],
      creditLedger: [
        { employee_id: '2025001', points: 50, created_at: '2026-08-19T18:00:00.000Z' },
        { employee_id: '2025001', points: 30, created_at: '2026-08-19T17:59:59.999Z' },
        { employee_id: '2025001', points: -10, created_at: '2026-11-20T03:00:00Z' },
      ],
      downlineIds: null,
      truncated: false,
      period: '3m',
      periodWindow: periodDateWindow('3m', FIXTURE_TODAY),
      periodWindowMs: periodMsWindow('3m', FIXTURE_TODAY),
    };
    const s = summarizeLearning(input, { employeeId: '2025001', role: 'employee' });
    check('boundary 3m: enrolledInPeriod 1 (start in, before out)', s.learning.enrolledInPeriod === 1, String(s.learning.enrolledInPeriod));
    check('boundary 3m: completedInPeriod 1 (progress in, completed_at at end out)', s.learning.completedInPeriod === 1, String(s.learning.completedInPeriod));
    check('boundary 3m: creditsInPeriod 40 net (50 − 10)', s.learning.creditsInPeriod === 40, String(s.learning.creditsInPeriod));
    check('boundary 3m: snapshots stay 2/2/70', s.learning.coursesEnrolled === 2 && s.learning.coursesCompleted === 2 && s.learning.creditBalance === 70, JSON.stringify(s.learning));
    const sToday = summarizeLearning({ ...input, period: 'today', periodWindow: periodDateWindow('today', FIXTURE_TODAY), periodWindowMs: periodMsWindow('today', FIXTURE_TODAY) }, { employeeId: '2025001', role: 'employee' });
    check('boundary today: enrolled 0, completed 1 (progress today), credits −10', sToday.learning.enrolledInPeriod === 0 && sToday.learning.completedInPeriod === 1 && sToday.learning.creditsInPeriod === -10, JSON.stringify(sToday.learning));
    const sAll = summarizeLearning({ ...input, period: 'all', periodWindow: null, periodWindowMs: null }, { employeeId: '2025001', role: 'employee' });
    check('boundary all: period fields == snapshots (2/2/70)', sAll.learning.enrolledInPeriod === 2 && sAll.learning.completedInPeriod === 2 && sAll.learning.creditsInPeriod === 70, JSON.stringify(sAll.learning));
  }
}

// ---- 3. DEV key match (proxy copy vs browser copy) ----
{
  const verifyJwtSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/verifyJwt.js'), 'utf8');
  const keysSrc = fs.readFileSync(path.join(ROOT, 'src/auth/keys.ts'), 'utf8');
  const pemOf = (src) => {
    const m = src.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/);
    return m ? m[0] : null;
  };
  const kidOf = (src) => {
    const m = src.match(/DEV_KID = '([0-9a-f]{16})'/);
    return m ? m[1] : null;
  };
  const proxyPem = pemOf(verifyJwtSrc);
  const browserPem = pemOf(keysSrc);
  check('dev key: proxy PEM matches src/auth/keys.ts', proxyPem !== null && proxyPem === browserPem, proxyPem ? `${proxyPem.length} chars` : 'no PEM found');
  check('dev key: proxy kid matches src/auth/keys.ts', kidOf(verifyJwtSrc) !== null && kidOf(verifyJwtSrc) === kidOf(keysSrc), `proxy=${kidOf(verifyJwtSrc)} browser=${kidOf(keysSrc)}`);
}

// ---- 4. Proxy handler (real handler, stubbed PostgREST) ----
{
  // Stub data: the fixture rows plus stub-only real users — 2025001
  // (active, supervisor 9990002, 10/20 on course A, 50 credits) and
  // 2025002 (inactive — the empty-state test).
  const STUB_TODAY = dhakaTodayIso();
  const stubFixture = buildLearningFixture(STUB_TODAY);
  const stubEmployees = [
    ...stubFixture.employees,
    { employee_id: '2025001', full_name: 'Stub Agent', designation: 'Field Associate', supervisor_id: '9990002', is_active: true },
    { employee_id: '2025002', full_name: 'Stub Inactive', designation: 'Field Associate', supervisor_id: '9990002', is_active: false },
  ];
  const at09 = (iso) => `${iso}T03:00:00Z`;
  const stubProgress = [...stubFixture.moduleProgress];
  for (let i = 1; i <= 20; i++) {
    stubProgress.push({
      employee_id: '2025001',
      course_id: COURSE_A_ID,
      module_id: `aos-${i}`,
      read_done: i <= 10,
      quiz_passed: false,
      best_score: null,
      attempts: i <= 10 ? 1 : 0,
      updated_at: at09(STUB_TODAY),
    });
  }
  const stubEnrollments = [
    ...stubFixture.enrollments,
    { employee_id: '2025001', course_id: COURSE_A_ID, status: 'enrolled', enrolled_at: at09(STUB_TODAY), completed_at: null },
  ];
  const stubCertificates = [...stubFixture.certificates];
  const stubCredits = [
    ...stubFixture.creditBalances,
    { employee_id: '2025001', balance: 50 },
  ];
  // The proxy fetches credit_ledger only for non-'all' periods; the
  // stub serves the fixture ledger plus the stub user's 50 credits
  // earned today (always inside any window).
  const stubLedger = [
    ...stubFixture.creditLedger,
    { employee_id: '2025001', course_id: COURSE_A_ID, module_id: null, reason: 'module_complete', points: 50, created_at: at09(STUB_TODAY) },
  ];
  const stubModules = [...stubFixture.courseModules];
  const stubCourses = [...stubFixture.courses];

  // BFS downline over the stub employees (mirrors the real RPC).
  function stubDownline(root) {
    const children = new Map();
    for (const e of stubEmployees) {
      if (!e.supervisor_id) continue;
      const list = children.get(String(e.supervisor_id)) || [];
      list.push(e);
      children.set(String(e.supervisor_id), list);
    }
    const out = [];
    const queue = [String(root)];
    const seen = new Set([String(root)]);
    while (queue.length > 0) {
      const id = queue.shift();
      for (const child of children.get(id) || []) {
        const cid = String(child.employee_id);
        if (seen.has(cid)) continue;
        seen.add(cid);
        out.push(cid);
        queue.push(cid);
      }
    }
    return out;
  }

  function makeStub(mode) {
    let employeeFetchCount = 0;
    let sawScopedFetch = false;
    const stub = async (url, init = {}) => {
      const u = new URL(String(url));
      const parts = u.pathname.split('/').filter(Boolean);
      const jsonRes = (rows, status = 200) => ({ ok: status < 400, status, json: async () => rows, headers: { get: () => null } });
      // RPC: POST /rest/v1/rpc/team_employee_ids { root }
      if (parts[parts.length - 2] === 'rpc') {
        const fn = parts[parts.length - 1];
        if (fn === 'team_employee_ids') {
          if (mode === 'rpc-down') return jsonRes({ message: 'boom' }, 500);
          const args = JSON.parse(init.body || '{}');
          return jsonRes(stubDownline(args.root));
        }
        throw new Error(`unexpected stub rpc: ${fn}`);
      }
      const table = parts[parts.length - 1];
      const params = u.searchParams;
      const isCount = init.headers && String(init.headers.Prefer || '').includes('count=exact');
      const inFilter = (rows) => {
        const f = params.get('employee_id');
        if (!f) return rows;
        const m = f.match(/^in\.\((.*)\)$/);
        if (!m) return rows;
        const want = new Set(m[1].split(','));
        return rows.filter((r) => want.has(String(r.employee_id)));
      };
      const pageOf = (rows) => {
        const limit = Number(params.get('limit') || 1000);
        const offset = Number(params.get('offset') || 0);
        return rows.slice(offset, offset + limit);
      };
      const countRes = (rows) => ({
        ok: true,
        status: 200,
        json: async () => [],
        headers: { get: (name) => (String(name).toLowerCase() === 'content-range' ? `0-0/${rows.length}` : null) },
      });
      if (table === 'employees') {
        employeeFetchCount++;
        // The stub ignores the select allowlist on purpose: every row
        // carries canary PII, so a leak in the summarizer would show.
        const rows = [...stubEmployees]
          .map((e) => ({ ...e, email: 'canary@example.com', phone: '01700000002' }))
          .sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)));
        return jsonRes(pageOf(rows));
      }
      if (table === 'course_modules') return jsonRes(pageOf(stubModules));
      if (table === 'courses') {
        let rows = [...stubCourses];
        if (params.get('is_published') === 'eq.true') rows = rows.filter((c) => c.is_published === true);
        return jsonRes(pageOf(rows));
      }
      if (table === 'module_progress' || table === 'enrollments' || table === 'certificates' || table === 'credit_balances' || table === 'credit_ledger') {
        const source = table === 'module_progress' ? stubProgress : table === 'enrollments' ? stubEnrollments : table === 'certificates' ? stubCertificates : table === 'credit_balances' ? stubCredits : stubLedger;
        const filtered = inFilter(source);
        if (!isCount && params.get('employee_id')) sawScopedFetch = true;
        if (isCount) return countRes(filtered);
        return jsonRes(pageOf(filtered));
      }
      throw new Error(`unexpected stub table: ${table}`);
    };
    stub.employeeFetchCount = () => employeeFetchCount;
    stub.sawScopedFetch = () => sawScopedFetch;
    return stub;
  }

  process.env.LEARNINGHUB_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.LEARNINGHUB_SERVICE_ROLE_KEY = 'stub-key';
  process.env.HUB_DEMO_FIXTURE = 'true';
  process.env.VERCEL_ENV = 'preview';

  const realFetch = globalThis.fetch;
  const normalStub = makeStub('normal');
  globalThis.fetch = normalStub;
  const { default: handler } = await import('../api/learning-data.js?stub=1');

  {
    const { res } = await callHandler(handler, mockReq());
    check('proxy: no token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const { res } = await callHandler(handler, mockReq({ token: 'not.a.token' }));
    check('proxy: garbage token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { alg: 'HS256' });
    const { res } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: alg HS256 -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { kid: 'deadbeefdeadbeef' });
    const { res } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: unknown kid -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { expired: true });
    const { res } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: expired token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' });
    const { res } = await callHandler(handler, mockReq({ method: 'POST', token: t }));
    check('proxy: POST -> 405', res.statusCode === 405, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: demo admin -> 200, fixture (demo:true)', res.statusCode === 200 && json?.demo === true, `status=${res.statusCode} demo=${json?.demo}`);
    check('proxy: demo admin org enrolled 30 completed 1 certs 1 credits 690', json?.learning?.coursesEnrolled === 30 && json?.learning?.coursesCompleted === 1 && json?.learning?.certificates === 1 && json?.learning?.creditBalance === 690, JSON.stringify(json?.learning));
    check('proxy: Cache-Control private, no-store', res.headers['Cache-Control'] === 'private, no-store', res.headers['Cache-Control']);
    check('proxy: fixture response has no canary PII', !res.body.includes('canary@example.com') && !res.body.includes('01700000002'), '');
  }
  {
    // Live path through the stub (non-demo caller).
    const t = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: stub user live -> 200, demo:false', res.statusCode === 200 && json?.demo === false, `status=${res.statusCode} demo=${json?.demo}`);
    check('proxy: stub user course A 50% (10/20), enrolled 1, credits 50', json?.learning?.currentCourse?.percent === 50 && json?.learning?.currentCourse?.modulesDone === 10 && json?.learning?.coursesEnrolled === 1 && json?.learning?.creditBalance === 50, JSON.stringify(json?.learning));
    check('proxy: stub user truncated false', json?.truncated === false, String(json?.truncated));
    check('proxy: live response has no canary PII', !res.body.includes('canary@example.com') && !res.body.includes('01700000002') && !res.body.includes('"email"'), '');
  }
  {
    // Flag off: a demo caller goes down the LIVE path. The stub adds
    // 2025001 + 2025002 under 9990002, so the team is 7 direct
    // reports (5 fixture + 2 stub) — avg (60+50+45+40+30+50+0)/7 = 39.
    delete process.env.HUB_DEMO_FIXTURE;
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: demo w/o flag -> live path, demo:false', res.statusCode === 200 && json?.demo === false, `demo=${json?.demo}`);
    check('proxy: live team_lead own 80%, team avg 39, direct 7, size 7', json?.learning?.currentCourse?.percent === 80 && json?.team?.avgProgress === 39 && json?.team?.directCount === 7 && json?.team?.teamSize === 7, `own=${json?.learning?.currentCourse?.percent} avg=${json?.team?.avgProgress} direct=${json?.team?.directCount} size=${json?.team?.teamSize}`);
    check('proxy: live team_lead learning members 6 (inactive has none)', json?.team?.learningMembersCount === 6, String(json?.team?.learningMembersCount));
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  {
    const t = signToken({ sub: '2025999', name: 'Nobody', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: unknown stub user -> empty, no-lms-record', res.statusCode === 200 && json?.empty === true && json?.emptyReason === 'no-lms-record', `empty=${json?.empty} reason=${json?.emptyReason}`);
  }
  {
    const t = signToken({ sub: '2025002', name: 'Stub Inactive', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: inactive stub user -> empty, no-lms-record', res.statusCode === 200 && json?.empty === true && json?.emptyReason === 'no-lms-record', `empty=${json?.empty} reason=${json?.emptyReason}`);
  }
  {
    // VERCEL_ENV is 'production' on this project's deployments — the
    // fixture must serve with the flag set regardless (live bug
    // 2026-11-20).
    process.env.VERCEL_ENV = 'production';
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: demo + flag in production env -> fixture served', res.statusCode === 200 && json?.demo === true && json?.scope === 'team', `demo=${json?.demo} scope=${json?.scope}`);
    process.env.VERCEL_ENV = 'preview';
  }
  {
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res } = await callHandler(handler, mockReq({ token: t, url: '/api/learning-data?period=bogus' }));
    check('proxy: invalid period -> 400', res.statusCode === 400, String(res.statusCode));
  }
  {
    // Demo path honours ?period= — the fixture is relative-dated, so
    // its 3m org values (12 enrolled, 0 completed, 290 credits) hold
    // on any day (§2b).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t, url: '/api/learning-data?period=3m' }));
    check('proxy: demo ?period=3m -> 12/0/290', res.statusCode === 200 && json?.demo === true && json?.learning?.enrolledInPeriod === 12 && json?.learning?.completedInPeriod === 0 && json?.learning?.creditsInPeriod === 290, JSON.stringify(json?.learning));
    check('proxy: demo ?period=3m echoes period', json?.period === '3m', String(json?.period));
  }
  {
    // Default period is Today now: a bare demo call returns the
    // today window (fixture: 6 enrolled, 0 completed, 140 credits).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: default period is today (6/0/140)', res.statusCode === 200 && json?.period === 'today' && json?.learning?.enrolledInPeriod === 6 && json?.learning?.completedInPeriod === 0 && json?.learning?.creditsInPeriod === 140, JSON.stringify(json?.learning));
  }
  {
    // Custom ranges through the handler, demo + live paths. The
    // fixture is relative-dated, so [today, today] is 6/0/140 (demo
    // org) and [3m start, today] is 12/0/290; the live stub user
    // enrolled today with 50 ledger credits today (1/0/50).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const todayIso = STUB_TODAY;
    const start3m = periodDateWindow('3m', todayIso).start;
    const { res: resD1, json: jsonD1 } = await callHandler(handler, mockReq({ token: t, url: `/api/learning-data?period=custom&from=${todayIso}&to=${todayIso}` }));
    check('proxy: demo custom [today, today] -> 6/0/140', resD1.statusCode === 200 && jsonD1?.learning?.enrolledInPeriod === 6 && jsonD1?.learning?.completedInPeriod === 0 && jsonD1?.learning?.creditsInPeriod === 140, JSON.stringify(jsonD1?.learning));
    check('proxy: demo custom echoes period + window', jsonD1?.period === 'custom' && jsonD1?.periodWindow?.start === todayIso && jsonD1?.periodWindow?.end === todayIso, `${jsonD1?.period} ${JSON.stringify(jsonD1?.periodWindow)}`);
    const { res: resD2, json: jsonD2 } = await callHandler(handler, mockReq({ token: t, url: `/api/learning-data?period=custom&from=${start3m}&to=${todayIso}` }));
    check('proxy: demo custom [3m start, today] -> 12/0/290', resD2.statusCode === 200 && jsonD2?.learning?.enrolledInPeriod === 12 && jsonD2?.learning?.completedInPeriod === 0 && jsonD2?.learning?.creditsInPeriod === 290, JSON.stringify(jsonD2?.learning));
    const tLive = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res: resL1, json: jsonL1 } = await callHandler(handler, mockReq({ token: tLive, url: `/api/learning-data?period=custom&from=${todayIso}&to=${todayIso}` }));
    check('proxy: live custom [today, today] -> 1/0/50', resL1.statusCode === 200 && jsonL1?.learning?.enrolledInPeriod === 1 && jsonL1?.learning?.completedInPeriod === 0 && jsonL1?.learning?.creditsInPeriod === 50, JSON.stringify(jsonL1?.learning));
  }
  {
    // Invalid custom ranges are 400s, never silent fallbacks.
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const cases = [
      ['custom without a range', '/api/learning-data?period=custom'],
      ['custom from > to', '/api/learning-data?period=custom&from=2026-11-20&to=2026-11-01'],
      ['custom to in the future', '/api/learning-data?period=custom&from=2026-11-01&to=2099-01-01'],
      ['custom range over 2 years', '/api/learning-data?period=custom&from=2020-01-01&to=2026-11-20'],
      ['custom bad date', '/api/learning-data?period=custom&from=2026-02-30&to=2026-11-20'],
    ];
    for (const [name, url] of cases) {
      const { res } = await callHandler(handler, mockReq({ token: t, url }));
      check(`proxy: ${name} -> 400`, res.statusCode === 400, String(res.statusCode));
    }
  }
  {
    // Live path through the stub: 2025001 enrolled today with 50
    // ledger credits today — inside 6m, so the period fields equal
    // the snapshots (and the ledger fetch ran without error).
    const t = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t, url: '/api/learning-data?period=6m' }));
    check('proxy: stub user ?period=6m -> 1/0/50', res.statusCode === 200 && json?.demo === false && json?.learning?.enrolledInPeriod === 1 && json?.learning?.completedInPeriod === 0 && json?.learning?.creditsInPeriod === 50, JSON.stringify(json?.learning));
    check('proxy: stub user ?period=6m echoes period + window', json?.period === '6m' && json?.periodWindow?.start != null, `${json?.period} ${JSON.stringify(json?.periodWindow)}`);
  }
  check('proxy: employees fetched once (5-min cache)', normalStub.employeeFetchCount() === 1, `${normalStub.employeeFetchCount()} calls`);
  check('proxy: scoped fetches carry the employee filter', normalStub.sawScopedFetch() === true, '');

  // Drift: the team_employee_ids RPC is down -> BFS fallback gives the
  // same team (stub RPC mirrors the BFS).
  {
    delete process.env.HUB_DEMO_FIXTURE;
    globalThis.fetch = makeStub('rpc-down');
    const { default: h2 } = await import('../api/learning-data.js?stub=rpc-down');
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(h2, mockReq({ token: t }));
    check('proxy: RPC down -> BFS fallback, teamSize 7, avg 39', res.statusCode === 200 && json?.team?.teamSize === 7 && json?.team?.avgProgress === 39, `size=${json?.team?.teamSize} avg=${json?.team?.avgProgress}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  globalThis.fetch = realFetch;
}

if (liveAdmin) {
  console.log(
    `\nLIVE LEARNING (org) — Enrolled ${liveAdmin.learning?.coursesEnrolled} · completed ${liveAdmin.learning?.coursesCompleted} · ` +
      `certificates ${liveAdmin.learning?.certificates} · credits ${liveAdmin.learning?.creditBalance} · truncated=${liveAdmin.truncated}`,
  );
} else {
  console.log('\nLIVE LEARNING — skipped (no env vars; live verification runs post-push).');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Learning live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
