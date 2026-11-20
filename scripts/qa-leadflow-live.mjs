/**
 * LeadFlow — live data + proxy + fixture check (Node, no browser).
 *
 * Usage: `npm run qa:leadflow-live`.
 *
 * Mirrors scripts/qa-retail-live.mjs for the LeadFlow feed
 * (api/leadflow-data.js + api/_lib/leadflowSummary.js). The in-browser
 * QA cannot exercise the live fetch (no external network in headless
 * Chrome, no /api proxy under file://), so this script runs the Hub's
 * OWN production code against the live LeadFlow Supabase project from
 * Node, where the fetch works.
 *
 * Sections:
 *  1. Live introspection + live handler (SKIPPED without env vars):
 *     reads LEADFLOW_SUPABASE_URL + LEADFLOW_SERVICE_ROLE_KEY from
 *     process.env or the local .env (never printed, never committed).
 *     Introspects the LIVE LeadFlow columns first (spec §15.2: three
 *     divergent schema definitions — the live schema is authoritative
 *     and any divergence from the spec is flagged plainly), then calls
 *     the real handler for dynamically picked real users and checks
 *     scoping invariants + the no-PII rule (real customer names /
 *     mobiles fetched as canaries must NOT appear in any response).
 *     Without the vars this section SKIPs gracefully (exit 0) — live
 *     verification then runs post-push against the deployed preview,
 *     where the vars exist.
 *  2. Demo fixture: the synthetic slice's hand-computed values, exact.
 *     Pinned to 2026-11-20 (FIXTURE_TODAY) so the bucket expectations
 *     are deterministic.
 *  2b. Time-frame filter (fixture, pinned date): createdInPeriod per
 *     period (hand-computed org + employee values, independent
 *     recomputation from the raw rows for the team-lead scopes);
 *     snapshots (converted / follow-up buckets / todayCollection)
 *     never move; boundary dates via hand-built rows (window start
 *     inclusive, end exclusive).
 *  3. Key match: the DEV public key PEM + kid bundled in the proxy
 *     (api/_lib/verifyJwt.js) must equal the browser's copy
 *     (src/auth/keys.ts).
 *  4. Proxy handler: the real handler with a PostgREST stub serving
 *     the fixture rows (plus one stub-only real user) and ephemeral-key
 *     JWTs — 401s, 405, demo fixture gating (flag on/off, production
 *     env), live-path scoping, no-PII canaries in the stub rows, the
 *     terminal-status fallback, the subordinates-missing retry (BFS),
 *     and the custom_fields-missing retry. Period handling: invalid
 *     period -> 400, demo + live (count-query) paths honour ?period=.
 *
 * Read-only: SELECTs only against LeadFlow Supabase, no writes. The
 * proxy section never touches the network (stubbed fetch). Exits
 * non-zero if any check fails.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dhakaTodayIso } from '../api/_lib/supabase.js';
import {
  summarizeLeadflow,
  aggregateLeadCounts,
  scopeSetsFor,
} from '../api/_lib/leadflowSummary.js';
import { buildLeadflowFixture } from '../api/_lib/demoFixtureLeadflow.js';
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
  for (const k of ['LEADFLOW_SUPABASE_URL', 'LEADFLOW_SERVICE_ROLE_KEY']) {
    if (process.env[k]) out[k] = process.env[k];
  }
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if ((k === 'LEADFLOW_SUPABASE_URL' || k === 'LEADFLOW_SERVICE_ROLE_KEY') && !out[k]) {
        out[k] = v.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return out;
}
const env = loadEnv();
const hasLive = Boolean(env.LEADFLOW_SUPABASE_URL && env.LEADFLOW_SERVICE_ROLE_KEY);

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

const mockReq = ({ method = 'GET', token = null, url = '/api/leadflow-data' } = {}) => ({
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
  skip('live LeadFlow introspection', 'LEADFLOW_SUPABASE_URL / LEADFLOW_SERVICE_ROLE_KEY not set — live verification runs post-push');
  skip('live LeadFlow handler', 'no env vars (see above)');
} else {
  process.env.LEADFLOW_SUPABASE_URL = env.LEADFLOW_SUPABASE_URL;
  process.env.LEADFLOW_SERVICE_ROLE_KEY = env.LEADFLOW_SERVICE_ROLE_KEY;
  const base = env.LEADFLOW_SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: env.LEADFLOW_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.LEADFLOW_SERVICE_ROLE_KEY}`,
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
  const usersProbe = await probe('users');
  check('live users table readable', usersProbe.ok, `HTTP ${usersProbe.status}`);
  const usersCols = usersProbe.columns;
  for (const col of ['id', 'employee_id', 'full_name', 'subordinates', 'manager_id']) {
    check(`live users column: ${col}`, usersCols.includes(col), usersCols.length > 0 ? '' : '(no rows returned — columns unverifiable)');
  }
  const leadsProbe = await probe('leads');
  check('live leads table readable', leadsProbe.ok, `HTTP ${leadsProbe.status}`);
  const leadsCols = leadsProbe.columns;
  for (const col of ['id', 'current_status', 'next_follow_up_at', 'assigned_to', 'custom_fields', 'created_at', 'is_deleted']) {
    check(`live leads column: ${col}`, leadsCols.includes(col), leadsCols.length > 0 ? '' : '(no rows returned — columns unverifiable)');
  }
  console.log(`INFO  live leads has customer_name: ${leadsCols.includes('customer_name')} · mobile: ${leadsCols.includes('mobile')} (proxy never selects them)`);
  // Terminal statuses come from the Metadata Engine options table, not
  // the legacy lead_status table (migration 013 has no meta column —
  // live finding 2026-11-20).
  const statusProbe = await probe('options');
  check('live options table readable', statusProbe.ok, `HTTP ${statusProbe.status}`);
  if (statusProbe.ok) {
    for (const col of ['field_key', 'option_value', 'meta']) {
      check(`live options column: ${col}`, statusProbe.columns.includes(col), '');
    }
  }

  // Dynamic user picks: first user with subordinates (team lead) + first without (employee).
  const usersRes = await fetch(`${base}/rest/v1/users?select=id,employee_id,full_name,subordinates,manager_id&order=employee_id&limit=1000`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const liveUsers = usersRes.ok ? await usersRes.json() : [];
  check('live users list fetched', Array.isArray(liveUsers) && liveUsers.length > 0, `${liveUsers.length} users`);
  const leadUser = liveUsers.find((u) => Array.isArray(u.subordinates) && u.subordinates.length > 0) || null;
  const empUser = liveUsers.find((u) => !Array.isArray(u.subordinates) || u.subordinates.length === 0) || null;
  console.log(`INFO  live team-lead pick: ${leadUser?.employee_id ?? '(none)'} · employee pick: ${empUser?.employee_id ?? '(none)'}`);

  // Real customer names/mobiles as PII canaries — never printed.
  const canaryRes = await fetch(`${base}/rest/v1/leads?select=customer_name,mobile&limit=5`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const canaryRows = canaryRes.ok ? await canaryRes.json() : [];
  const canaries = [];
  for (const r of canaryRows) {
    if (r.customer_name) canaries.push(String(r.customer_name));
    if (r.mobile) canaries.push(String(r.mobile));
  }
  console.log(`INFO  PII canaries collected: ${canaries.length} values (not shown)`);

  delete process.env.HUB_DEMO_FIXTURE;
  const { default: liveHandler } = await import('../api/leadflow-data.js?live=1');
  const bodies = [];
  if (leadUser) {
    const t = signToken({ sub: leadUser.employee_id, name: leadUser.full_name || 'X', role: 'admin' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    liveAdmin = json;
    bodies.push(res.body);
    check('live admin: 200, org scope, demo:false', res.statusCode === 200 && json?.scope === 'org' && json?.demo === false, `status=${res.statusCode} scope=${json?.scope}`);
    // NOTE: org lead volume is data, not an invariant — a young
    // LeadFlow may genuinely hold zero leads. Check well-formedness;
    // the INFO line below reports the live count.
    check('live admin: org total is a number', typeof json?.leads?.total === 'number', `total=${json?.leads?.total}`);
    check('live admin: terminalFallback is boolean', typeof json?.terminalFallback === 'boolean', `terminalFallback=${json?.terminalFallback}`);
    console.log(`INFO  live org — follow-ups today ${json?.followups?.today} · overdue ${json?.followups?.overdue} · upcoming ${json?.followups?.upcoming} · total leads ${json?.leads?.total} · open ${json?.leads?.open} · converted ${json?.leads?.converted}`);
  } else {
    skip('live admin org summary', 'no user with subordinates found');
  }
  if (leadUser) {
    const t = signToken({ sub: leadUser.employee_id, name: leadUser.full_name || 'X', role: 'team_lead' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live team_lead: 200, team scope, teamSize > 0', res.statusCode === 200 && json?.scope === 'team' && (json?.team?.teamSize ?? 0) > 0, `status=${res.statusCode} teamSize=${json?.team?.teamSize}`);
    if (liveAdmin) {
      check('live team_lead: own today <= org today', (json?.followups?.today ?? 0) <= (liveAdmin.followups?.today ?? 0), `${json?.followups?.today} <= ${liveAdmin.followups?.today}`);
      check('live team_lead: team today <= org today', (json?.team?.followups?.today ?? 0) <= (liveAdmin.followups?.today ?? 0), `${json?.team?.followups?.today} <= ${liveAdmin.followups?.today}`);
    }
  } else {
    skip('live team_lead scoping', 'no user with subordinates found');
  }
  if (empUser) {
    const t = signToken({ sub: empUser.employee_id, name: empUser.full_name || 'X', role: 'employee' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live employee: 200, own scope, team null', res.statusCode === 200 && json?.scope === 'own' && json?.team === null, `status=${res.statusCode} scope=${json?.scope}`);
  } else {
    skip('live employee scoping', 'no user without subordinates found');
  }
  {
    const t = signToken({ sub: '0000000', name: 'Nobody', role: 'employee' });
    const { res, json } = await callHandler(liveHandler, mockReq({ token: t }));
    bodies.push(res.body);
    check('live unknown user: empty, no-leadflow-account', res.statusCode === 200 && json?.empty === true && json?.emptyReason === 'no-leadflow-account', `empty=${json?.empty} reason=${json?.emptyReason}`);
  }
  {
    const joined = bodies.join('\n');
    const leaked = canaries.filter((c) => c && joined.includes(c));
    check('live no-PII: no real customer name/mobile in any response', leaked.length === 0, `${canaries.length} canaries checked`);
    check('live no-PII: no customer_name/mobile keys in any response', !joined.includes('customer_name') && !joined.includes('"mobile"'), '');
  }
}

// ---- 2. Demo fixture exact values (pinned date) ----
function summarizeFixture(employeeId, role) {
  const fixture = buildLeadflowFixture(FIXTURE_TODAY);
  const scopes = scopeSetsFor(fixture.users, employeeId, role);
  if (!scopes) {
    return summarizeLeadflow(
      {
        users: fixture.users,
        ownCounts: { followups: { overdue: 0, today: 0, upcoming: 0 }, total: 0, open: 0, converted: 0, todayCollection: 0 },
        teamCounts: { followups: { overdue: 0, today: 0, upcoming: 0 }, total: 0, open: 0, converted: 0, todayCollection: 0 },
        rows: fixture.leads,
        terminalStatuses: fixture.terminalStatuses,
      },
      { employeeId, role },
      FIXTURE_TODAY,
    );
  }
  const byUuid = new Map(fixture.users.map((u) => [String(u.id), u]));
  const byEmp = new Map(fixture.users.map((u) => [String(u.employee_id).toUpperCase(), u]));
  const ownCounts = aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.ownUuids, scopes.ownEmpIds, fixture.terminalStatuses, FIXTURE_TODAY);
  const teamCounts = aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.teamUuids, scopes.teamEmpIds, fixture.terminalStatuses, FIXTURE_TODAY);
  return summarizeLeadflow(
    { users: fixture.users, ownCounts, teamCounts, rows: fixture.leads, terminalStatuses: fixture.terminalStatuses },
    { employeeId, role },
    FIXTURE_TODAY,
  );
}
{
  const emp = summarizeFixture('9990001', 'employee');
  check('fixture emp followups 3/1/2 (all 6)', emp.followups.today === 3 && emp.followups.overdue === 1 && emp.followups.upcoming === 2 && emp.followups.all === 6, JSON.stringify(emp.followups));
  check('fixture emp leads total 7 open 6 converted 1 collected 1', emp.leads.total === 7 && emp.leads.open === 6 && emp.leads.converted === 1 && emp.leads.todayCollection === 1, JSON.stringify(emp.leads));
  check(
    'fixture emp statusCounts',
    emp.leads.statusCounts['Follow-up Set'] === 3 && emp.leads.statusCounts.Contacted === 1 && emp.leads.statusCounts.Interested === 2 && emp.leads.statusCounts.Converted === 1,
    JSON.stringify(emp.leads.statusCounts),
  );
  check('fixture emp team null, scope own', emp.team === null && emp.scope === 'own' && emp.empty === false, `${emp.scope} empty=${emp.empty}`);

  const lead = summarizeFixture('9990002', 'team_lead');
  check('fixture lead own followups 4/1/3 (all 8)', lead.followups.today === 4 && lead.followups.overdue === 1 && lead.followups.upcoming === 3 && lead.followups.all === 8, JSON.stringify(lead.followups));
  check('fixture lead own total 9 open 8 converted 1 collected 2', lead.leads.total === 9 && lead.leads.open === 8 && lead.leads.converted === 1 && lead.leads.todayCollection === 2, JSON.stringify(lead.leads));
  check('fixture lead team followups 12/3/5 (all 20)', lead.team.followups.today === 12 && lead.team.followups.overdue === 3 && lead.team.followups.upcoming === 5 && lead.team.followups.all === 20, JSON.stringify(lead.team.followups));
  check('fixture lead team total 24 open 20 converted 3', lead.team.leads.total === 24 && lead.team.leads.open === 20 && lead.team.leads.converted === 3, JSON.stringify(lead.team.leads));
  check('fixture lead teamSize 3', lead.team.teamSize === 3, String(lead.team.teamSize));
  check(
    'fixture lead members 9990011/9990012/9990001 by today desc',
    lead.team.members.map((m) => m.employeeId).join(',') === '9990011,9990012,9990001' &&
      lead.team.members.map((m) => m.followupsToday).join(',') === '5,4,3' &&
      lead.team.members.map((m) => m.openLeads).join(',') === '8,6,6',
    JSON.stringify(lead.team.members),
  );
  check('fixture lead scope team', lead.scope === 'team', lead.scope);

  const mgr = summarizeFixture('9990003', 'manager');
  check('fixture mgr own followups 2/1/2 (all 5)', mgr.followups.today === 2 && mgr.followups.overdue === 1 && mgr.followups.upcoming === 2 && mgr.followups.all === 5, JSON.stringify(mgr.followups));
  check('fixture mgr own total 5 open 5 converted 0', mgr.leads.total === 5 && mgr.leads.open === 5 && mgr.leads.converted === 0, JSON.stringify(mgr.leads));
  check('fixture mgr team followups 47/12/14 (all 73)', mgr.team.followups.today === 47 && mgr.team.followups.overdue === 12 && mgr.team.followups.upcoming === 14 && mgr.team.followups.all === 73, JSON.stringify(mgr.team.followups));
  check('fixture mgr team total 78 open 73 converted 4', mgr.team.leads.total === 78 && mgr.team.leads.open === 73 && mgr.team.leads.converted === 4, JSON.stringify(mgr.team.leads));
  check('fixture mgr teamSize 6', mgr.team.teamSize === 6, String(mgr.team.teamSize));
  check(
    'fixture mgr members 9990005 then 9990002',
    mgr.team.members.map((m) => m.employeeId).join(',') === '9990005,9990002' &&
      mgr.team.members.map((m) => m.followupsToday).join(',') === '8,4' &&
      mgr.team.members.map((m) => m.openLeads).join(',') === '13,8',
    JSON.stringify(mgr.team.members),
  );
  check('fixture mgr scope subtree', mgr.scope === 'subtree', mgr.scope);

  const adm = summarizeFixture('9990004', 'admin');
  check('fixture admin org followups 49/13/16 (all 78)', adm.followups.today === 49 && adm.followups.overdue === 13 && adm.followups.upcoming === 16 && adm.followups.all === 78, JSON.stringify(adm.followups));
  check('fixture admin org total 83 open 78 converted 4 collected 4', adm.leads.total === 83 && adm.leads.open === 78 && adm.leads.converted === 4 && adm.leads.todayCollection === 4, JSON.stringify(adm.leads));
  check(
    'fixture admin org statusCounts',
    adm.leads.statusCounts['Follow-up Set'] === 49 && adm.leads.statusCounts.Contacted === 13 && adm.leads.statusCounts.Interested === 16 && adm.leads.statusCounts.Converted === 4 && adm.leads.statusCounts['Not Interested'] === 1,
    JSON.stringify(adm.leads.statusCounts),
  );
  check('fixture admin team null, scope org', adm.team === null && adm.scope === 'org', adm.scope);

  const unknown = summarizeFixture('9990099', 'employee');
  check('fixture unknown user: empty, no-leadflow-account', unknown.empty === true && unknown.emptyReason === 'no-leadflow-account', `empty=${unknown.empty} reason=${unknown.emptyReason}`);
}

// ---- 2b. Time-frame filter (fixture, pinned date) ----
function summarizeFixturePeriod(employeeId, role, period) {
  const fixture = buildLeadflowFixture(FIXTURE_TODAY);
  const scopes = scopeSetsFor(fixture.users, employeeId, role);
  const periodMs = periodMsWindow(period, FIXTURE_TODAY);
  const periodWindow = periodDateWindow(period, FIXTURE_TODAY);
  const byUuid = new Map(fixture.users.map((u) => [String(u.id), u]));
  const byEmp = new Map(fixture.users.map((u) => [String(u.employee_id).toUpperCase(), u]));
  const ownCounts = aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.ownUuids, scopes.ownEmpIds, fixture.terminalStatuses, FIXTURE_TODAY, periodMs);
  const teamCounts = aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.teamUuids, scopes.teamEmpIds, fixture.terminalStatuses, FIXTURE_TODAY, periodMs);
  return summarizeLeadflow(
    { users: fixture.users, ownCounts, teamCounts, rows: fixture.leads, terminalStatuses: fixture.terminalStatuses, period, periodWindow },
    { employeeId, role },
    FIXTURE_TODAY,
  );
}
{
  // Hand-computed org values: 83 leads, 4 created today, the other 79
  // cycling created ages [5, 40, 100, 200, 300] days — this-month 4+16,
  // 3m +16, 6m +16, this-year all 83 (300 days back is still in-year).
  const orgExpected = { 'this-month': 20, '3m': 36, '6m': 52, 'this-year': 83, 'all': 83 };
  for (const [period, exp] of Object.entries(orgExpected)) {
    const s = summarizeFixturePeriod('9990004', 'admin', period);
    check(`period ${period}: org createdInPeriod ${exp}`, s.leads.createdInPeriod === exp, String(s.leads.createdInPeriod));
    check(`period ${period}: org total stays 83`, s.leads.total === 83, String(s.leads.total));
    check(`period ${period}: org converted stays 4 (snapshot)`, s.leads.converted === 4, String(s.leads.converted));
    check(`period ${period}: org todayCollection stays 4 (snapshot)`, s.leads.todayCollection === 4, String(s.leads.todayCollection));
    check(`period ${period}: org buckets stay 13/49/16 (snapshot)`, s.followups.overdue === 13 && s.followups.today === 49 && s.followups.upcoming === 16, JSON.stringify(s.followups));
    const w = periodDateWindow(period, FIXTURE_TODAY);
    check(`period ${period}: echoes period + window`, s.period === period && JSON.stringify(s.periodWindow) === JSON.stringify(w), `${s.period} ${JSON.stringify(s.periodWindow)}`);
  }

  // Employee 9990001: 7 leads — 1 created today, the other 6 the first
  // six cycle ages [5, 40, 100, 200, 300, 5].
  const empExpected = { 'this-month': 3, '3m': 4, '6m': 5, 'this-year': 7, 'all': 7 };
  for (const [period, exp] of Object.entries(empExpected)) {
    const s = summarizeFixturePeriod('9990001', 'employee', period);
    check(`period ${period}: emp createdInPeriod ${exp}`, s.leads.createdInPeriod === exp, String(s.leads.createdInPeriod));
    check(`period ${period}: emp total stays 7`, s.leads.total === 7, String(s.leads.total));
  }

  // Independent recomputation from the raw fixture rows for the
  // team-lead scopes (own + team): count rows whose assignee is in
  // scope and whose created_at falls in the window.
  const fixture = buildLeadflowFixture(FIXTURE_TODAY);
  const uuidToEmp = new Map(fixture.users.map((u) => [String(u.id), String(u.employee_id)]));
  const leadScopes = scopeSetsFor(fixture.users, '9990002', 'team_lead');
  const ownEmps = new Set([...leadScopes.ownUuids].map((id) => uuidToEmp.get(id)));
  const teamEmps = new Set([...leadScopes.teamUuids].map((id) => uuidToEmp.get(id)));
  for (const period of ['this-month', '3m', '6m', 'this-year', 'all']) {
    const w = periodMsWindow(period, FIXTURE_TODAY);
    const inWindow = (iso) => {
      if (w === null) return true;
      const ms = Date.parse(iso);
      return ms >= w.startMs && ms < w.endMs;
    };
    const ownExp = fixture.leads.filter((r) => ownEmps.has(uuidToEmp.get(String(r.assigned_to))) && inWindow(r.created_at)).length;
    const teamExp = fixture.leads.filter((r) => teamEmps.has(uuidToEmp.get(String(r.assigned_to))) && inWindow(r.created_at)).length;
    const s = summarizeFixturePeriod('9990002', 'team_lead', period);
    check(`period ${period}: recomputed lead own createdInPeriod matches`, s.leads.createdInPeriod === ownExp, `${s.leads.createdInPeriod} vs ${ownExp}`);
    check(`period ${period}: recomputed lead team createdInPeriod matches`, s.team.leads.createdInPeriod === teamExp, `${s.team.leads.createdInPeriod} vs ${teamExp}`);
  }

  // Boundary dates: window start inclusive, window end exclusive.
  // 3m window pinned 2026-11-20: [2026-08-20T00:00 Dhaka,
  // 2026-11-21T00:00 Dhaka) = [2026-08-19T18:00Z, 2026-11-20T18:00Z).
  {
    const fx = buildLeadflowFixture(FIXTURE_TODAY);
    const byUuid = new Map(fx.users.map((u) => [String(u.id), u]));
    const byEmp = new Map(fx.users.map((u) => [String(u.employee_id).toUpperCase(), u]));
    const ownUuid = new Set([String(fx.users.find((u) => u.employee_id === '9990001').id)]);
    const ownEmp = new Set(['9990001']);
    const mk = (id, createdAt) => ({
      id,
      current_status: 'Follow-up Set',
      next_follow_up_at: null,
      assigned_to: [...ownUuid][0],
      custom_fields: {},
      created_at: createdAt,
      is_deleted: false,
    });
    const rows = [
      mk('00000000-0000-0000-0003-000000000001', '2026-08-19T18:00:00.000Z'), // exactly start -> in
      mk('00000000-0000-0000-0003-000000000002', '2026-08-19T17:59:59.999Z'), // 1ms before -> out
      mk('00000000-0000-0000-0003-000000000003', '2026-11-20T18:00:00.000Z'), // exactly end -> out
      mk('00000000-0000-0000-0003-000000000004', '2026-11-20T02:00:00.000Z'), // today 08:00 Dhaka -> in
    ];
    const counts = aggregateLeadCounts(rows, byUuid, byEmp, ownUuid, ownEmp, fx.terminalStatuses, FIXTURE_TODAY, periodMsWindow('3m', FIXTURE_TODAY));
    check('boundary 3m: start + today in, before + end out (2 of 4)', counts.createdInPeriod === 2 && counts.total === 4, `createdInPeriod=${counts.createdInPeriod} total=${counts.total}`);
    const countsAll = aggregateLeadCounts(rows, byUuid, byEmp, ownUuid, ownEmp, fx.terminalStatuses, FIXTURE_TODAY, null);
    check('boundary all: createdInPeriod == total (4)', countsAll.createdInPeriod === 4, String(countsAll.createdInPeriod));
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
  // Stub data: the fixture rows plus one stub-only real user (2025001,
  // reporting to 9990002 but NOT in 9990002's subordinates array — so
  // the subordinates-primary rule and the BFS fallback disagree about
  // the team, which is exactly what the drift tests assert).
  const STUB_TODAY = dhakaTodayIso();
  const stubFixture = buildLeadflowFixture(STUB_TODAY);
  // The stub user's UUID follows the fixture's padding (padStart 12);
  // the manager link is derived from the fixture row (never hand-typed).
  const stubUserId = `00000000-0000-0000-0000-${'2025001'.padStart(12, '0')}`;
  const leadId = stubFixture.users.find((u) => u.employee_id === '9990002').id;
  const stubUsers = [
    ...stubFixture.users,
    { id: stubUserId, employee_id: '2025001', full_name: 'Stub Agent', subordinates: [], manager_id: leadId },
  ];
  const at10 = (iso) => `${iso}T04:00:00Z`;
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const stubLeads = [
    ...stubFixture.leads,
    { id: '00000000-0000-0000-0002-000000000001', current_status: 'Follow-up Set', next_follow_up_at: at10(STUB_TODAY), assigned_to: stubUserId, custom_fields: {}, created_at: at10(STUB_TODAY), is_deleted: false },
    { id: '00000000-0000-0000-0002-000000000002', current_status: 'Contacted', next_follow_up_at: at10(addDays(STUB_TODAY, -1)), assigned_to: stubUserId, custom_fields: {}, created_at: at10(addDays(STUB_TODAY, -5)), is_deleted: false },
    { id: '00000000-0000-0000-0002-000000000003', current_status: 'Interested', next_follow_up_at: at10(addDays(STUB_TODAY, 1)), assigned_to: stubUserId, custom_fields: {}, created_at: at10(addDays(STUB_TODAY, -5)), is_deleted: false },
  ];
  const stubStatuses = [
    { option_value: 'Converted', meta: { isTerminal: true } },
    { option_value: 'Not Interested', meta: { isTerminal: true } },
    { option_value: 'Follow-up Set', meta: { isTerminal: false } },
  ];

  // Naive timestamps parse as UTC (mirrors supabase.js parseTsMs).
  const parseMs = (v) => {
    if (v === null || v === undefined) return null;
    let s = String(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  };
  // Split a PostgREST or=(...)/and=(...) list on top-level commas.
  const splitTop = (inner) => {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of inner) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  };
  const inList = (expr) => {
    const m = expr.match(/\.in\.\((.*)\)$/);
    return m ? m[1].split(',') : [];
  };
  function leadMatches(row, params) {
    for (const [key, value] of params.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      if (key === 'is_deleted') {
        if (value === 'eq.false' && row.is_deleted !== false) return false;
        continue;
      }
      if (key === 'or') {
        const inner = value.replace(/^\(|\)$/g, '');
        const ok = splitTop(inner).some((arm) => {
          if (arm.startsWith('assigned_to.in.')) return inList(arm).includes(String(row.assigned_to));
          if (arm.startsWith('custom_fields->>assignedTo.in.')) {
            const want = inList(arm).map((s) => s.toUpperCase());
            return want.includes(String(row.custom_fields?.assignedTo ?? '').toUpperCase());
          }
          if (arm.startsWith('assigned_to.eq.')) return String(row.assigned_to) === arm.slice('assigned_to.eq.'.length);
          return false;
        });
        if (!ok) return false;
        continue;
      }
      if (key === 'and') {
        const inner = value.replace(/^\(|\)$/g, '');
        const ok = splitTop(inner).every((arm) => {
          const m = arm.match(/^(\w+)\.(gte|lt)\.(.+)$/);
          if (!m) return false;
          const ms = parseMs(row[m[1]]);
          const bound = parseMs(m[3]);
          if (ms === null || bound === null) return false;
          return m[2] === 'gte' ? ms >= bound : ms < bound;
        });
        if (!ok) return false;
        continue;
      }
      if (key === 'current_status') {
        if (value.startsWith('not.in.')) {
          if (inList(value).includes(String(row.current_status))) return false;
        } else if (value.startsWith('eq.')) {
          if (String(row.current_status) !== value.slice(3)) return false;
        }
        continue;
      }
      if (key === 'next_follow_up_at' || key === 'created_at') {
        const m = value.match(/^(gte|lt)\.(.+)$/);
        if (!m) continue;
        const ms = parseMs(row[key]);
        const bound = parseMs(m[2]);
        if (ms === null || bound === null) return false;
        if (m[1] === 'gte' ? ms < bound : ms >= bound) return false;
        continue;
      }
    }
    return true;
  }

  function makeStub(mode) {
    let userFetchCount = 0;
    let sawScopedRowFetch = false;
    const stub = async (url, init = {}) => {
      const u = new URL(String(url));
      const table = u.pathname.split('/').pop();
      const params = u.searchParams;
      const isCount = init.headers && String(init.headers.Prefer || '').includes('count=exact');
      const jsonRes = (rows, status = 200) => ({ ok: status < 400, status, json: async () => rows, headers: { get: () => null } });
      if (table === 'users') {
        userFetchCount++;
        if (mode === 'no-subordinates' && (params.get('select') || '').includes('subordinates')) {
          return jsonRes({ message: 'column users.subordinates does not exist' }, 400);
        }
        let rows = [...stubUsers].sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)));
        if (mode === 'no-subordinates') rows = rows.map(({ subordinates, ...rest }) => rest);
        const limit = Number(params.get('limit') || 1000);
        const offset = Number(params.get('offset') || 0);
        return jsonRes(rows.slice(offset, offset + limit));
      }
      if (table === 'options') {
        if (mode === 'no-options') return jsonRes({ message: 'boom' }, 500);
        return jsonRes(stubStatuses);
      }
      if (table === 'leads') {
        // Real PostgREST 400s ANY query referencing a missing column —
        // the select AND the or-filter's custom_fields arm (count
        // queries use select=id but still reference it in the filter).
        if (
          mode === 'no-custom-fields' &&
          ((params.get('select') || '').includes('custom_fields') ||
            (params.get('or') || '').includes('custom_fields'))
        ) {
          return jsonRes({ message: 'column leads.custom_fields does not exist' }, 400);
        }
        const filtered = stubLeads.filter((r) => leadMatches(r, params));
        // Regression guard: the row fetch must carry the scope filter
        // (an earlier build passed filters top-level to supaGet, which
        // silently dropped them — the summarizer masked it).
        if (!isCount && params.get('or')) sawScopedRowFetch = true;
        if (isCount) {
          return {
            ok: true,
            status: 200,
            json: async () => [],
            headers: { get: (name) => (String(name).toLowerCase() === 'content-range' ? `0-0/${filtered.length}` : null) },
          };
        }
        // The stub ignores the select allowlist on purpose: every row
        // carries canary PII, so a leak in the summarizer would show.
        const rows = filtered
          .map((r) => ({ ...r, customer_name: `CANARY CUSTOMER ${r.id.slice(-4)}`, mobile: '01700000001' }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const limit = Number(params.get('limit') || 1000);
        const offset = Number(params.get('offset') || 0);
        return jsonRes(rows.slice(offset, offset + limit));
      }
      throw new Error(`unexpected stub table: ${table}`);
    };
    stub.userFetchCount = () => userFetchCount;
    stub.sawScopedRowFetch = () => sawScopedRowFetch;
    return stub;
  }

  process.env.LEADFLOW_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.LEADFLOW_SERVICE_ROLE_KEY = 'stub-key';
  process.env.HUB_DEMO_FIXTURE = 'true';
  process.env.VERCEL_ENV = 'preview';

  const realFetch = globalThis.fetch;
  const normalStub = makeStub('normal');
  globalThis.fetch = normalStub;
  const { default: handler } = await import('../api/leadflow-data.js?stub=1');

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
    check('proxy: demo admin fixture total 83, today 49', json?.leads?.total === 83 && json?.followups?.today === 49, `total=${json?.leads?.total} today=${json?.followups?.today}`);
    check('proxy: Cache-Control private, no-store', res.headers['Cache-Control'] === 'private, no-store', res.headers['Cache-Control']);
    check('proxy: fixture response has no canary PII', !res.body.includes('CANARY') && !res.body.includes('01700000001'), '');
  }
  {
    // Live path through the stub (non-demo caller): exact counts from
    // the PostgREST count queries, not the fixture aggregator.
    const t = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: stub user live -> 200, demo:false', res.statusCode === 200 && json?.demo === false, `status=${res.statusCode} demo=${json?.demo}`);
    check('proxy: stub user followups 1/1/1 (all 3)', json?.followups?.today === 1 && json?.followups?.overdue === 1 && json?.followups?.upcoming === 1 && json?.followups?.all === 3, JSON.stringify(json?.followups));
    check('proxy: stub user total 3 open 3 collected 1', json?.leads?.total === 3 && json?.leads?.open === 3 && json?.leads?.todayCollection === 1, JSON.stringify(json?.leads));
    check('proxy: live response has no canary PII', !res.body.includes('CANARY') && !res.body.includes('01700000001') && !res.body.includes('customer_name'), '');
  }
  {
    // Flag off: a demo caller goes down the LIVE path (subordinates
    // primary — 2025001 is not in 9990002's subordinates, so the team
    // is the 3 FAs, today 12).
    delete process.env.HUB_DEMO_FIXTURE;
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: demo w/o flag -> live path, demo:false', res.statusCode === 200 && json?.demo === false, `demo=${json?.demo}`);
    check('proxy: live team_lead own 4 / team 12 (subordinates primary)', json?.followups?.today === 4 && json?.team?.followups?.today === 12, `own=${json?.followups?.today} team=${json?.team?.followups?.today}`);
    check('proxy: live team_lead teamSize 3', json?.team?.teamSize === 3, String(json?.team?.teamSize));
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  {
    const t = signToken({ sub: '2025999', name: 'Nobody', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: unknown stub user -> empty, no-leadflow-account', res.statusCode === 200 && json?.empty === true && json?.emptyReason === 'no-leadflow-account', `empty=${json?.empty} reason=${json?.emptyReason}`);
  }
  {
    // Admin WITHOUT a LeadFlow row still sees org-wide (standing
    // rule: Admin/T&D sees org-wide; T&D staff have no LeadFlow
    // account — live finding 2026-11-20: 2025019 has none). Stub org
    // total = 83 fixture leads + 3 extra stub leads.
    const t = signToken({ sub: '2025999', name: 'Nobody', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t }));
    check('proxy: admin w/o account -> org-wide, not empty', res.statusCode === 200 && json?.scope === 'org' && json?.demo === false && json?.empty === false, `status=${res.statusCode} scope=${json?.scope} empty=${json?.empty}`);
    check('proxy: admin w/o account -> org total 86', json?.leads?.total === 86, `total=${json?.leads?.total}`);
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
    const { res } = await callHandler(handler, mockReq({ token: t, url: '/api/leadflow-data?period=bogus' }));
    check('proxy: invalid period -> 400', res.statusCode === 400, String(res.statusCode));
  }
  {
    // Demo path honours ?period= — the fixture is relative-dated, so
    // its 3m createdInPeriod (36 of 83) holds on any day (§2b).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t, url: '/api/leadflow-data?period=3m' }));
    check('proxy: demo ?period=3m -> createdInPeriod 36 of 83', res.statusCode === 200 && json?.demo === true && json?.leads?.createdInPeriod === 36 && json?.leads?.total === 83, `createdInPeriod=${json?.leads?.createdInPeriod} total=${json?.leads?.total}`);
    check('proxy: demo ?period=3m echoes period', json?.period === '3m', String(json?.period));
  }
  {
    // Live path (PostgREST count queries) honours ?period=: the stub
    // org is 83 fixture leads + 3 stub leads (created today / 5 days
    // ago — always inside 3m), so 3m createdInPeriod is 36 + 3 = 39.
    const t = signToken({ sub: '2025999', name: 'Nobody', role: 'admin' });
    const { res, json } = await callHandler(handler, mockReq({ token: t, url: '/api/leadflow-data?period=3m' }));
    check('proxy: live org ?period=3m -> createdInPeriod 39 of 86', res.statusCode === 200 && json?.demo === false && json?.leads?.createdInPeriod === 39 && json?.leads?.total === 86, `createdInPeriod=${json?.leads?.createdInPeriod} total=${json?.leads?.total}`);
    check('proxy: live ?period=3m echoes period + window', json?.period === '3m' && json?.periodWindow?.start != null, `${json?.period} ${JSON.stringify(json?.periodWindow)}`);
  }
  {
    // Stub user's 3 leads (today + 5 days ago) are all inside 6m —
    // the count-query path must return createdInPeriod == total.
    // (this-month is NOT used here: it is non-deterministic near a
    // month boundary, when "5 days ago" falls in the prior month.)
    const t = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res, json } = await callHandler(handler, mockReq({ token: t, url: '/api/leadflow-data?period=6m' }));
    check('proxy: stub user ?period=6m -> createdInPeriod 3 == total', res.statusCode === 200 && json?.leads?.createdInPeriod === 3 && json?.leads?.total === 3, `createdInPeriod=${json?.leads?.createdInPeriod} total=${json?.leads?.total}`);
  }
  check('proxy: users fetched once (5-min cache)', normalStub.userFetchCount() === 1, `${normalStub.userFetchCount()} calls`);
  check('proxy: row fetch carries the scope filter', normalStub.sawScopedRowFetch() === true, '');

  // Drift: options unreadable -> terminal fallback, same numbers
  // (the fallback set equals the fixture's terminal set).
  {
    delete process.env.HUB_DEMO_FIXTURE;
    globalThis.fetch = makeStub('no-options');
    const { default: h2 } = await import('../api/leadflow-data.js?stub=no-options');
    const t = signToken({ sub: '2025001', name: 'Stub Agent', role: 'employee' });
    const { res, json } = await callHandler(h2, mockReq({ token: t }));
    check('proxy: options down -> terminalFallback true, counts intact', res.statusCode === 200 && json?.terminalFallback === true && json?.leads?.total === 3, `fallback=${json?.terminalFallback} total=${json?.leads?.total}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  // Drift: users.subordinates missing -> retry without it, BFS over
  // manager_id finds 2025001 too (team today 13, not 12).
  {
    delete process.env.HUB_DEMO_FIXTURE;
    globalThis.fetch = makeStub('no-subordinates');
    const { default: h3 } = await import('../api/leadflow-data.js?stub=no-subordinates');
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(h3, mockReq({ token: t }));
    check('proxy: subordinates missing -> BFS fallback, team today 13', res.statusCode === 200 && json?.team?.followups?.today === 13 && json?.team?.teamSize === 4, `team today=${json?.team?.followups?.today} teamSize=${json?.team?.teamSize}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  // Drift: leads.custom_fields missing -> retry without the fallback
  // arm; assigned_to counts stay exact.
  {
    delete process.env.HUB_DEMO_FIXTURE;
    globalThis.fetch = makeStub('no-custom-fields');
    const { default: h4 } = await import('../api/leadflow-data.js?stub=no-custom-fields');
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await callHandler(h4, mockReq({ token: t }));
    check('proxy: custom_fields missing -> counts intact (team 12)', res.statusCode === 200 && json?.team?.followups?.today === 12, `team today=${json?.team?.followups?.today}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  globalThis.fetch = realFetch;
}

if (liveAdmin) {
  console.log(
    `\nLIVE LEADFLOW (org) — Follow-ups today ${liveAdmin.followups?.today} · overdue ${liveAdmin.followups?.overdue} · upcoming ${liveAdmin.followups?.upcoming} · ` +
      `Total leads ${liveAdmin.leads?.total} · open ${liveAdmin.leads?.open} · converted ${liveAdmin.leads?.converted} · collected today ${liveAdmin.leads?.todayCollection}`,
  );
} else {
  console.log('\nLIVE LEADFLOW — skipped (no env vars; live verification runs post-push).');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} LeadFlow live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
