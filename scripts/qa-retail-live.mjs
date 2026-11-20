/**
 * Retail Dashboard — live data + proxy + fixture check (Node, no browser).
 *
 * Usage: `npm run qa:retail-live`.
 *
 * The live-data proof for the Dashboard page: the in-browser QA
 * (scripts/qa-screenshots.mjs) cannot exercise the live fetch because
 * this VM's headless Chrome has no external network and there is no
 * /api/retail-data proxy under file://. This script runs the Hub's OWN
 * production code — the shared summarizer (api/_lib/retailSummary.js)
 * and the proxy handler (api/retail-data.js) — against the real retail
 * endpoint payload from Node, where the fetch works.
 *
 * Sections:
 *  1. Live payload: the retail endpoint answers with the expected shape.
 *  2. Admin summary vs the spec's §12 expected values (tolerance +
 *     drift reporting — receipts sync daily, so values move; a failure
 *     here means either real drift past tolerance or a formula break —
 *     the detail prints the live value so a human can tell which).
 *  3. Independent recomputation: direct sums from the raw payload must
 *     match the summarizer EXACTLY (same payload, no drift possible),
 *     and the bucket partition must reconcile to the org total.
 *  4. Scoping: real UM / FA / BE / GM codes, subtree <= org, the
 *     Employee role failing closed, staff IDs empty with 'no-code'.
 *  5. Demo fixture: the synthetic slice's hand-computed values, exact.
 *     The fixture scenario is PINNED to 2026-11-20 (FIXTURE_TODAY) —
 *     its due expectations depend on instalment dates relative to the
 *     reference day, so pinning keeps them deterministic. The live
 *     sections above use the real current date.
 *  6. Key match: the DEV public key PEM + kid bundled in the proxy
 *     (api/_lib/verifyJwt.js) must equal the browser's copy
 *     (src/auth/keys.ts) — the two copies must never drift apart.
 *  7. Proxy handler: the real handler, with the retail fetch stubbed to
 *     the live payload and test JWTs signed with an ephemeral keypair —
 *     401 without/a bad token, 200 + correct summary for admin/UM,
 *     demo fixture gating (flag on/off, production env), no raw rows
 *     in any response, payload caching.
 *
 * Read-only: one GET to the public retail endpoint, no writes. The proxy
 * section never touches the network (stubbed fetch). Exits non-zero if
 * any check fails.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { summarizeRetail, summarizeWithIndex, buildRetailIndex, dhakaToday } from '../api/_lib/retailSummary.js';
import { buildDemoPayload } from '../api/_lib/demoFixture.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const RETAIL_URL = 'https://retail-dashboard-zeta.vercel.app/api/sales-data';
const FIXTURE_TODAY = '2026-11-20';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const fmt = (n) => `৳${Math.round(n).toLocaleString('en-IN')}`;
const withinPct = (actual, expected, pct) => Math.abs(actual - expected) <= (expected * pct) / 100;
const num = (v) => Number(v) || 0;
const isNewType = (r) => String(r.type || '').trim().toLowerCase() === 'new';

// ---- 1. Live payload ----
const liveRes = await fetch(RETAIL_URL, { signal: AbortSignal.timeout(60000) });
check('retail endpoint: HTTP 200', liveRes.ok, `HTTP ${liveRes.status}`);
const payload = await liveRes.json();
check('retail payload: records present', Array.isArray(payload.records) && payload.records.length > 1000, `${payload.records?.length} rows`);
check(
  'retail payload: duePolicies + producerDirectory present',
  Array.isArray(payload.duePolicies) && payload.duePolicies.length > 100 && Array.isArray(payload.producerDirectory) && payload.producerDirectory.length > 100,
  `due ${payload.duePolicies?.length} · directory ${payload.producerDirectory?.length}`,
);
console.log(`INFO  payload lastUpdated: ${payload.sync?.lastUpdated ?? '(none)'} · periodEnd: ${payload.periodEnd ?? '(none)'}`);

// ---- 2. Admin summary vs spec §12 (tolerance + drift) ----
const today = dhakaToday();
const index = buildRetailIndex(payload, today);
const admin = summarizeWithIndex(index, { employeeId: '2025019', role: 'admin' });
check('admin total within 5% of spec 35,867,072', withinPct(admin.totalPremium, 35867072, 5), fmt(admin.totalPremium));
check('admin FYCP within 5% of spec 33,603,172', withinPct(admin.fycp, 33603172, 5), fmt(admin.fycp));
check('admin policies within 5% of spec 2,282', withinPct(admin.policies, 2282, 5), String(admin.policies));
check(
  'admin persistency within 5 pts of spec 60.9%',
  admin.persistency !== null && Math.abs(admin.persistency.pct - 60.9) <= 5,
  admin.persistency ? `${admin.persistency.pct.toFixed(1)}% (${admin.persistency.inf}/${admin.persistency.all})` : 'null',
);
if (today.startsWith('2026-11')) {
  check('admin due Nov 2026 within 20% of spec 16,53,216', withinPct(admin.duePremium, 1653216, 20), `${fmt(admin.duePremium)} (${admin.duePolicies} pol)`);
} else {
  check('admin due this month positive (spec value is Nov 2026 only)', admin.duePremium > 0 && admin.duePolicies > 0, `${fmt(admin.duePremium)} (${admin.duePolicies} pol, ${admin.dueMonth})`);
}
check(
  'admin top BE within 5% of spec 60,69,003',
  withinPct(admin.leaderboard.entries[0]?.premium ?? 0, 6069003, 5),
  `${admin.leaderboard.entries[0]?.name ?? '(none)'} ${fmt(admin.leaderboard.entries[0]?.premium ?? 0)}`,
);
check('admin unassigned within 5% of spec 23,56,985', withinPct(admin.unassigned?.premium ?? 0, 2356985, 5), fmt(admin.unassigned?.premium ?? 0));
check(
  'admin active FAs sane (total ~629, active ~360)',
  withinPct(admin.activeFas.total, 629, 5) && withinPct(admin.activeFas.active, 360, 15),
  `${admin.activeFas.active} of ${admin.activeFas.total}`,
);

// ---- 3. Independent recomputation (exact — same payload) ----
const sumTotal = payload.records.reduce((a, r) => a + num(r.total), 0);
check('recompute: Σ total == admin totalPremium', Math.abs(sumTotal - admin.totalPremium) < 1, `${fmt(sumTotal)} vs ${fmt(admin.totalPremium)}`);
const sumFycp = payload.records.reduce((a, r) => a + num(r.fycp), 0);
check('recompute: Σ fycp == admin fycp', Math.abs(sumFycp - admin.fycp) < 1, `${fmt(sumFycp)} vs ${fmt(admin.fycp)}`);
const newPolicies = new Set(payload.records.filter(isNewType).map((r) => String(r.policy)));
check('recompute: distinct New policies == admin policies', newPolicies.size === admin.policies, `${newPolicies.size} vs ${admin.policies}`);
const sumNew = payload.records.filter(isNewType).reduce((a, r) => a + num(r.new), 0);
check('recompute: Σ New within 5% of spec 24,760,983', withinPct(sumNew, 24760983, 5), fmt(sumNew));
let bucketTotal = 0;
for (const b of index.faBuckets.values()) bucketTotal += b.total;
for (const b of index.directBuckets.values()) bucketTotal += b.total;
for (const b of index.residualBuckets.values()) bucketTotal += b.total;
check('reconcile: FA + direct + residual buckets == org total', Math.abs(bucketTotal - admin.totalPremium) < 1, `${fmt(bucketTotal)} vs ${fmt(admin.totalPremium)}`);
let residualTotal = 0;
for (const b of index.residualBuckets.values()) residualTotal += b.total;
check('reconcile: admin unassigned == Σ residual buckets', admin.unassigned !== null && Math.abs(admin.unassigned.premium - residualTotal) < 1, `${fmt(admin.unassigned?.premium ?? 0)} vs ${fmt(residualTotal)}`);

// ---- 4. Scoping (live payload) ----
const um = summarizeWithIndex(index, { employeeId: '1101020102', role: 'team_lead' });
check('scope UM team_lead: scope team, total within 10% of 4,107', um.scope === 'team' && withinPct(um.totalPremium, 4107, 10), `${um.scope} ${fmt(um.totalPremium)}`);
check('scope UM team_lead: leaderboard is direct reports (1–5)', um.leaderboard.kind === 'reports' && um.leaderboard.entries.length >= 1 && um.leaderboard.entries.length <= 5, `${um.leaderboard.entries.length} entries`);
check('scope UM team_lead: total <= org total', um.totalPremium <= admin.totalPremium, `${fmt(um.totalPremium)} <= ${fmt(admin.totalPremium)}`);
const umEmp = summarizeWithIndex(index, { employeeId: '1101020102', role: 'employee' });
check('scope UM as employee: fail-closed (0, own, no leaderboard)', umEmp.totalPremium === 0 && umEmp.scope === 'own' && umEmp.leaderboard.kind === 'none' && umEmp.empty === true, `total ${umEmp.totalPremium} empty=${umEmp.empty} reason=${umEmp.emptyReason}`);
// An FA with real rows (picked dynamically — a zero-row FA would make the check trivial).
const faCode = (() => {
  for (const r of payload.records) {
    const fa = index.canonicalFA(r.faCode);
    if (fa && (index.faBuckets.get(fa)?.total ?? 0) > 0) return fa;
  }
  return null;
})();
check('scope FA: a with-rows FA exists in the payload', faCode !== null, faCode ?? 'none');
if (faCode) {
  const fa = summarizeWithIndex(index, { employeeId: faCode, role: 'employee' });
  const faOwn = payload.records.filter((r) => index.canonicalFA(r.faCode) === faCode).reduce((a, r) => a + num(r.total), 0);
  check('scope FA employee: total == own bucket (independent)', Math.abs(fa.totalPremium - faOwn) < 1, `${fmt(fa.totalPremium)} vs ${fmt(faOwn)}`);
  check('scope FA employee: scope own, no leaderboard, 1 FA in scope', fa.scope === 'own' && fa.leaderboard.kind === 'none' && fa.activeFas.total === 1, JSON.stringify(fa.activeFas));
}
const be = summarizeWithIndex(index, { employeeId: 'NZI', role: 'manager' });
check('scope BE NZI manager: total == beTotals NZI (exact)', be.totalPremium === index.beTotals.get('NZI')?.total, `${fmt(be.totalPremium)} vs ${fmt(index.beTotals.get('NZI')?.total ?? 0)}`);
check('scope BE NZI manager: within 5% of spec 47,87,224', withinPct(be.totalPremium, 4787224, 5), fmt(be.totalPremium));
check('scope BE NZI manager: leaderboard is GM reports', be.leaderboard.kind === 'reports' && be.leaderboard.entries.length >= 1, `${be.leaderboard.entries.length} entries`);
const gm = summarizeWithIndex(index, { employeeId: '13', role: 'manager' });
check('scope GM KAMRUJJAMAN: within 5% of spec 31,54,333', withinPct(gm.totalPremium, 3154333, 5), fmt(gm.totalPremium));
check('scope GM KAMRUJJAMAN: 256 policies within 5%', withinPct(gm.policies, 256, 5), String(gm.policies));
const staff = summarizeWithIndex(index, { employeeId: '2025019', role: 'employee' });
check('scope staff ID as employee: empty, no-code', staff.empty === true && staff.emptyReason === 'no-code', `empty=${staff.empty} reason=${staff.emptyReason}`);

// ---- 5. Demo fixture exact values (pinned date) ----
{
  const fx = buildDemoPayload(FIXTURE_TODAY);
  const adm = summarizeRetail(fx, { employeeId: '9990004', role: 'admin' }, FIXTURE_TODAY);
  check('fixture admin total 241000', adm.totalPremium === 241000, String(adm.totalPremium));
  check('fixture admin FYCP 233000', adm.fycp === 233000, String(adm.fycp));
  check('fixture admin policies 9', adm.policies === 9, String(adm.policies));
  check('fixture admin due 38000 (5 pol)', adm.duePremium === 38000 && adm.duePolicies === 5, `${adm.duePremium} (${adm.duePolicies})`);
  check('fixture admin persistency 8/9', adm.persistency?.inf === 8 && adm.persistency?.all === 9, JSON.stringify(adm.persistency));
  check('fixture admin active 3 of 4', adm.activeFas.active === 3 && adm.activeFas.total === 4, JSON.stringify(adm.activeFas));
  check('fixture admin unassigned 7000 (1)', adm.unassigned?.premium === 7000 && adm.unassigned?.policies === 1, JSON.stringify(adm.unassigned));
  check('fixture admin BE DMO 234000 (8)', adm.leaderboard.entries[0]?.premium === 234000 && adm.leaderboard.entries[0]?.policies === 8, JSON.stringify(adm.leaderboard.entries));
  check('fixture admin deferred 6.2%', Math.abs(adm.deferredRatio - (15000 / 241000) * 100) < 0.01, String(adm.deferredRatio));
  check('fixture admin renewal 3.3%', Math.abs(adm.renewalRatio - (8000 / 241000) * 100) < 0.01, String(adm.renewalRatio));

  const mgr = summarizeRetail(fx, { employeeId: '9990003', role: 'manager' }, FIXTURE_TODAY);
  check('fixture mgr total 234000', mgr.totalPremium === 234000, String(mgr.totalPremium));
  check('fixture mgr FYCP 226000', mgr.fycp === 226000, String(mgr.fycp));
  check('fixture mgr policies 8', mgr.policies === 8, String(mgr.policies));
  check('fixture mgr due 38000 (5)', mgr.duePremium === 38000 && mgr.duePolicies === 5, `${mgr.duePremium} (${mgr.duePolicies})`);
  check('fixture mgr persistency 7/8', mgr.persistency?.inf === 7 && mgr.persistency?.all === 8, JSON.stringify(mgr.persistency));
  check('fixture mgr active 3 of 4', mgr.activeFas.active === 3 && mgr.activeFas.total === 4, JSON.stringify(mgr.activeFas));
  check('fixture mgr leaders 9990002 then 9990005', mgr.leaderboard.entries[0]?.premium === 164000 && mgr.leaderboard.entries[1]?.premium === 70000, JSON.stringify(mgr.leaderboard.entries));
  check('fixture mgr no unassigned', mgr.unassigned === null, JSON.stringify(mgr.unassigned));

  const lead = summarizeRetail(fx, { employeeId: '9990002', role: 'team_lead' }, FIXTURE_TODAY);
  check('fixture lead total 164000', lead.totalPremium === 164000, String(lead.totalPremium));
  check('fixture lead FYCP 156000', lead.fycp === 156000, String(lead.fycp));
  check('fixture lead policies 7', lead.policies === 7, String(lead.policies));
  check('fixture lead due 34000 (4)', lead.duePremium === 34000 && lead.duePolicies === 4, `${lead.duePremium} (${lead.duePolicies})`);
  check('fixture lead persistency 5/6', lead.persistency?.inf === 5 && lead.persistency?.all === 6, JSON.stringify(lead.persistency));
  check('fixture lead active 2 of 3', lead.activeFas.active === 2 && lead.activeFas.total === 3, JSON.stringify(lead.activeFas));
  check('fixture lead leaders 67000/57000/15000', lead.leaderboard.entries.map((e) => e.premium).join(',') === '67000,57000,15000', JSON.stringify(lead.leaderboard.entries));
  check('fixture lead deferred 3.0% / renewal 4.9%', Math.abs(lead.deferredRatio - (5000 / 164000) * 100) < 0.01 && Math.abs(lead.renewalRatio - (8000 / 164000) * 100) < 0.01, `${lead.deferredRatio} / ${lead.renewalRatio}`);

  const emp = summarizeRetail(fx, { employeeId: '9990001', role: 'employee' }, FIXTURE_TODAY);
  check('fixture emp total 67000', emp.totalPremium === 67000, String(emp.totalPremium));
  check('fixture emp policies 3', emp.policies === 3, String(emp.policies));
  check('fixture emp due 17000 (2)', emp.duePremium === 17000 && emp.duePolicies === 2, `${emp.duePremium} (${emp.duePolicies})`);
  check('fixture emp persistency 2/2', emp.persistency?.inf === 2 && emp.persistency?.all === 2, JSON.stringify(emp.persistency));
  check('fixture emp active 1 of 1', emp.activeFas.active === 1 && emp.activeFas.total === 1, JSON.stringify(emp.activeFas));
  check('fixture emp no leaderboard', emp.leaderboard.kind === 'none' && emp.leaderboard.entries.length === 0, emp.leaderboard.kind);
  check('fixture emp scope own', emp.scope === 'own', emp.scope);
  check('fixture lead scope team', lead.scope === 'team', lead.scope);
  check('fixture mgr scope subtree', mgr.scope === 'subtree', mgr.scope);
  check('fixture admin scope org', adm.scope === 'org', adm.scope);
}

// ---- 6. DEV key match (proxy copy vs browser copy) ----
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

// ---- 7. Proxy handler (real handler, stubbed retail fetch) ----
{
  // Ephemeral keypair for the test; the proxy reads it via env.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const kid = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
  process.env.HUB_PUBLIC_KEY_PEM = pem;
  process.env.HUB_KID = kid;
  process.env.HUB_DEMO_FIXTURE = 'true';
  process.env.VERCEL_ENV = 'preview';

  const b64url = (buf) => Buffer.from(buf).toString('base64url');
  function signToken(claims, { kid: k = kid, alg = 'RS256' } = {}) {
    const head = b64url(JSON.stringify({ alg, typ: 'JWT', kid: k }));
    const iat = Math.floor(Date.now() / 1000);
    const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + 3600, iss: 'shanta-life-agent-hub' }));
    const input = `${head}.${body}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
    return `${input}.${b64url(sig)}`;
  }

  // Stub the retail fetch with the live payload fetched above.
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls++;
    if (String(url).includes('retail-dashboard-zeta.vercel.app/api/sales-data')) {
      return { ok: true, status: 200, json: async () => payload };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const { default: handler } = await import('../api/retail-data.js');
  const mockReq = ({ method = 'GET', token = null } = {}) => ({
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const mockRes = () => {
    const res = { statusCode: 0, headers: {}, body: '' };
    res.setHeader = (k, v) => {
      res.headers[k] = v;
    };
    res.end = (b) => {
      res.body = b;
    };
    return res;
  };
  async function call(req) {
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

  {
    const { res } = await call(mockReq());
    check('proxy: no token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const { res } = await call(mockReq({ token: 'not.a.token' }));
    check('proxy: garbage token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { alg: 'HS256' });
    const { res } = await call(mockReq({ token: t }));
    check('proxy: alg HS256 -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { kid: 'deadbeefdeadbeef' });
    const { res } = await call(mockReq({ token: t }));
    check('proxy: unknown kid -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const iat = Math.floor(Date.now() / 1000) - 7200;
    const body = b64url(
      JSON.stringify({ sub: '2025019', name: 'X', role: 'admin', iat, exp: iat + 3600, iss: 'shanta-life-agent-hub' }),
    );
    const input = `${head}.${body}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
    const t = `${input}.${b64url(sig)}`;
    const { res } = await call(mockReq({ token: t }));
    check('proxy: expired token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const { res } = await call(mockReq({ method: 'POST', token: signToken({ sub: '9990004', name: 'X', role: 'admin' }) }));
    check('proxy: POST -> 405', res.statusCode === 405, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo admin -> 200, fixture (demo:true)', res.statusCode === 200 && json?.demo === true, `status=${res.statusCode} demo=${json?.demo}`);
    check('proxy: demo admin fixture total 241000', json?.totalPremium === 241000, String(json?.totalPremium));
    check('proxy: Cache-Control private, no-store', res.headers['Cache-Control'] === 'private, no-store', res.headers['Cache-Control']);
  }
  {
    const t = signToken({ sub: '2025019', name: 'Staff', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: real admin -> 200, live org summary', res.statusCode === 200 && json?.demo === false && json?.scope === 'org', `status=${res.statusCode} demo=${json?.demo} scope=${json?.scope}`);
    check('proxy: real admin total == live admin total', json?.totalPremium === admin.totalPremium, `${fmt(json?.totalPremium ?? 0)} vs ${fmt(admin.totalPremium)}`);
    check('proxy: no raw rows leak in the response', !res.body.includes('"records"') && !res.body.includes('NAZAHA HAQUE'), '');
  }
  {
    const t = signToken({ sub: '1101020102', name: 'UM', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: UM team_lead -> 200 scoped', res.statusCode === 200 && json?.scope === 'team' && json?.totalPremium === um.totalPremium, `status=${res.statusCode} scope=${json?.scope} total=${json?.totalPremium}`);
  }
  {
    delete process.env.HUB_DEMO_FIXTURE;
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo w/o flag -> empty, demo:false', res.statusCode === 200 && json?.demo === false && json?.empty === true && json?.emptyReason === 'no-code', `demo=${json?.demo} empty=${json?.empty} reason=${json?.emptyReason}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  {
    process.env.VERCEL_ENV = 'production';
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo in production env -> no fixture', res.statusCode === 200 && json?.demo === false && json?.empty === true, `demo=${json?.demo} empty=${json?.empty}`);
    process.env.VERCEL_ENV = 'preview';
  }
  check('proxy: retail fetch cached (1 call)', fetchCalls === 1, `${fetchCalls} calls`);
  globalThis.fetch = realFetch;
}

console.log(
  `\nLIVE RETAIL KPIs — Total premium ${fmt(admin.totalPremium)} · FYCP ${fmt(admin.fycp)} · Policies ${admin.policies} · ` +
    `Due ${fmt(admin.duePremium)} (${admin.duePolicies} pol, ${admin.dueMonth}) · Persistency ${admin.persistency ? `${admin.persistency.pct.toFixed(1)}% (${admin.persistency.inf}/${admin.persistency.all})` : '—'} · ` +
    `Active FAs ${admin.activeFas.active} of ${admin.activeFas.total} · Unassigned ${fmt(admin.unassigned?.premium ?? 0)} · ` +
    `Top BE ${admin.leaderboard.entries[0]?.name ?? '(none)'} ${fmt(admin.leaderboard.entries[0]?.premium ?? 0)}`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} retail live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
