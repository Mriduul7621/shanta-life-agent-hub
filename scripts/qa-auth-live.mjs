/**
 * Real auth — handler + signing + role derivation check (Node, no browser).
 *
 * Usage: `npm run qa:auth-live`.
 *
 * Mirrors scripts/qa-leadflow-live.mjs for the real-auth slice
 * (api/hub-auth.js + api/_lib/signJwt.js + api/_lib/hubRoles.js).
 * The in-browser QA cannot exercise the live sign-in (no /api under
 * file://), so this script runs the Hub's OWN production code from
 * Node, where the handler can be called directly.
 *
 * Sections:
 *  1. Live introspection + live handler (SKIPPED without env vars):
 *     reads LEARNINGHUB_SUPABASE_URL + LEARNINGHUB_SERVICE_ROLE_KEY
 *     from process.env or the local .env (never printed, never
 *     committed). Probes the LIVE employees + user_roles tables,
 *     then calls the real handler with NONEXISTENT identifiers only
 *     (a bogus Employee ID -> no_lms_record; a bogus email -> wrong
 *     credential) — a negative test exercises the live path
 *     end-to-end (employees fetch + RPC call + signing config)
 *     WITHOUT touching any real user's lockout counters. A full
 *     live sign-in needs a real credential, which this script never
 *     has — that check runs post-push with Mahadi's own sign-in.
 *     Without the vars this section SKIPs gracefully (exit 0).
 *  2. Role derivation (pure unit tests): admin via the LH user_roles
 *     marker, manager/team_lead/employee from the tree, inactive
 *     rows not counted.
 *  3. Signing lib (pure unit tests): kid derivation, key-source
 *     precedence, the production runtime guard (refuse to sign
 *     with the dev key when HUB_BUILD_TARGET=production), and a
 *     sign-then-verify round trip against verifyJwt.js.
 *  4. Handler with a stubbed LH backend: valid PIN login -> 200 +
 *     verifiable JWT; wrong PIN / bad format / locked / inactive /
 *     must-change / unknown user / email staff login / 999 test ID;
 *     role derivation end-to-end (employee/team_lead/manager/
 *     admin); no-credential/no-PII leak checks (the LH session
 *     token, the PIN, and profile.mobile must never appear in any
 *     response); 405/400 handling; the production guard at the
 *     handler level.
 *
 * Read-only against live LH except for the RPC calls in section 1,
 * which target nonexistent identifiers (the RPCs burn one bcrypt
 * and return a generic failure without touching any counters).
 * The stub section never touches the network. Exits non-zero if
 * any check fails.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifySsoTokenNode } from '../api/_lib/verifyJwt.js';
import { deriveHubRole, isLhAdmin } from '../api/_lib/hubRoles.js';
import {
  deriveKidFromPrivateKey,
  signingKeyConfig,
  signSsoTokenNode,
} from '../api/_lib/signJwt.js';

const ROOT = path.resolve(import.meta.dirname, '..');

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

// Ephemeral keypair: the handler signs with it (HUB_JWT_PRIVATE_KEY_B64)
// and the checks verify with its public half. Never the dev key.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPrivateB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const testPem = publicKey.export({ type: 'spki', format: 'pem' });
const testKid = crypto
  .createHash('sha256')
  .update(publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex')
  .slice(0, 16);
const testVerifyConfig = { pem: testPem, kids: new Set([testKid]) };

// A second ephemeral keypair, for the key-precedence checks.
const altKeypair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const altPrivateB64 = altKeypair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const altKid = crypto
  .createHash('sha256')
  .update(altKeypair.publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex')
  .slice(0, 16);

// ---- Mock request/response (the handler streams the JSON body) ----
const mockReq = ({ method = 'POST', body = null, rawBody = null } = {}) => {
  const buf = rawBody !== null
    ? Buffer.from(rawBody, 'utf8')
    : Buffer.from(JSON.stringify(body ?? {}), 'utf8');
  return {
    method,
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
  };
};
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
if (!hasLive) {
  skip('live LH introspection', 'LEARNINGHUB_SUPABASE_URL / LEARNINGHUB_SERVICE_ROLE_KEY not set — live verification runs post-push');
  skip('live hub-auth handler', 'no env vars (see above)');
} else {
  process.env.LEARNINGHUB_SUPABASE_URL = env.LEARNINGHUB_SUPABASE_URL;
  process.env.LEARNINGHUB_SERVICE_ROLE_KEY = env.LEARNINGHUB_SERVICE_ROLE_KEY;
  process.env.HUB_JWT_PRIVATE_KEY_B64 = testPrivateB64;
  process.env.HUB_JWT_KID = testKid;
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
  const empProbe = await probe('employees');
  check('live employees table readable', empProbe.ok, `HTTP ${empProbe.status}`);
  if (empProbe.ok) {
    for (const col of ['employee_id', 'full_name', 'supervisor_id', 'is_active']) {
      check(`live employees column: ${col}`, empProbe.columns.includes(col), empProbe.columns.length > 0 ? '' : '(no rows returned — columns unverifiable)');
    }
  }
  const rolesProbe = await probe('user_roles');
  check('live user_roles table readable', rolesProbe.ok, `HTTP ${rolesProbe.status}`);
  if (rolesProbe.ok) {
    for (const col of ['employee_id', 'role']) {
      check(`live user_roles column: ${col}`, rolesProbe.columns.includes(col), rolesProbe.columns.length > 0 ? '' : '(no rows returned — columns unverifiable)');
    }
  }

  // Negative handler tests with NONEXISTENT identifiers only — no
  // real user's lockout counters are touched.
  const { default: liveHandler } = await import('../api/hub-auth.js?live=1');
  {
    const { res, json } = await callHandler(
      liveHandler,
      mockReq({ body: { identifier: '2999999', credential: '123456' } }),
    );
    check('live handler: bogus Employee ID -> 401 no_lms_record', res.statusCode === 401 && json?.error === 'no_lms_record', `status=${res.statusCode} error=${json?.error}`);
    check('live handler: no token in the failure body', typeof json?.token !== 'string', '');
  }
  {
    const { res, json } = await callHandler(
      liveHandler,
      mockReq({ body: { identifier: 'nobody-qa@shantalife.com', credential: 'WrongPass1' } }),
    );
    check('live handler: bogus email -> 401 wrong_pin', res.statusCode === 401 && json?.error === 'wrong_pin', `status=${res.statusCode} error=${json?.error}`);
  }
}

// ---- 2. Role derivation (pure unit tests) ----
{
  const employees = [
    { employee_id: '2025001', supervisor_id: '2025002', is_active: true },
    { employee_id: '2025002', supervisor_id: '2025003', is_active: true },
    { employee_id: '2025003', supervisor_id: null, is_active: true },
    { employee_id: '2025004', supervisor_id: '2025003', is_active: true },
    { employee_id: '2025005', supervisor_id: '2025004', is_active: false },
    { employee_id: '2025006', supervisor_id: '2025002', is_active: true },
  ];
  check('roles: no subordinates -> employee', deriveHubRole(employees, '2025001', ['learner']) === 'employee');
  check('roles: >=1 subordinate -> team_lead', deriveHubRole(employees, '2025002', ['learner']) === 'team_lead');
  check('roles: subtree contains a team_lead -> manager', deriveHubRole(employees, '2025003', ['learner']) === 'manager');
  check('roles: inactive subordinate does not count', deriveHubRole(employees, '2025004', ['learner']) === 'employee');
  check('roles: td_admin -> admin', deriveHubRole(employees, '2025001', ['learner', 'td_admin']) === 'admin');
  check('roles: super_admin -> admin', deriveHubRole(employees, '2025001', ['super_admin']) === 'admin');
  check('roles: trainer/supervisor are NOT admin', deriveHubRole(employees, '2025001', ['trainer', 'supervisor']) === 'employee');
  check('roles: isLhAdmin handles null', isLhAdmin(null) === false && isLhAdmin(['TD_ADMIN']) === true);
  check('roles: unknown caller, no admin marker -> employee', deriveHubRole(employees, '2025999', ['learner']) === 'employee');
}

// ---- 3. Signing lib (pure unit tests) ----
{
  check('signing: derived kid matches the keypair', deriveKidFromPrivateKey(testPrivateB64) === testKid);
  check(
    'signing: HUB_JWT_PRIVATE_KEY_B64 wins over VITE_',
    signingKeyConfig({ HUB_JWT_PRIVATE_KEY_B64: testPrivateB64, VITE_JWT_PRIVATE_KEY_B64: altPrivateB64 }).kid === testKid,
  );
  check(
    'signing: falls back to VITE_ when HUB_ is unset',
    signingKeyConfig({ VITE_JWT_PRIVATE_KEY_B64: altPrivateB64 }).kid === altKid,
  );
  check('signing: null when no key is configured', signingKeyConfig({}) === null);
  check(
    'signing: HUB_JWT_KID override respected',
    signingKeyConfig({ HUB_JWT_PRIVATE_KEY_B64: testPrivateB64, HUB_JWT_KID: 'overridekid12345' }).kid === 'overridekid12345',
  );
  let guardThrew = false;
  try {
    signingKeyConfig({ HUB_BUILD_TARGET: 'production', VITE_JWT_PRIVATE_KEY_B64: altPrivateB64 });
  } catch (e) {
    guardThrew = /production/.test(String(e && e.message));
  }
  check('signing: production target without HUB_ key REFUSES (runtime guard)', guardThrew);
  check(
    'signing: production target WITH HUB_ key signs',
    signingKeyConfig({ HUB_BUILD_TARGET: 'production', HUB_JWT_PRIVATE_KEY_B64: testPrivateB64 }).kid === testKid,
  );
  const config = { privateKeyB64: testPrivateB64, kid: testKid, isProductionKey: true };
  const token = signSsoTokenNode({ sub: '2025001', name: 'Stub Agent', role: 'employee' }, config);
  const claims = verifySsoTokenNode(token, testVerifyConfig);
  check(
    'signing: round trip verifies (sub/name/role/exp-iat=3600)',
    claims !== null && claims.sub === '2025001' && claims.name === 'Stub Agent' && claims.role === 'employee' && claims.exp - claims.iat === 3600,
    claims ? JSON.stringify(claims) : 'null',
  );
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  check('signing: header alg RS256 + derived kid', header.alg === 'RS256' && header.kid === testKid, JSON.stringify(header));
}

// ---- 4. Handler with a stubbed LH backend ----
{
  const realFetch = globalThis.fetch;
  process.env.LEARNINGHUB_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.LEARNINGHUB_SERVICE_ROLE_KEY = 'stub-key';
  process.env.HUB_JWT_PRIVATE_KEY_B64 = testPrivateB64;
  process.env.HUB_JWT_KID = testKid;
  delete process.env.HUB_BUILD_TARGET;

  const stubEmployees = [
    { employee_id: '2025001', full_name: 'Stub Agent', supervisor_id: '2025002', is_active: true },
    { employee_id: '2025002', full_name: 'Stub Lead', supervisor_id: '2025003', is_active: true },
    { employee_id: '2025003', full_name: 'Stub Manager', supervisor_id: null, is_active: true },
    { employee_id: '2025004', full_name: 'Stub Admin', supervisor_id: null, is_active: true },
    { employee_id: '2025005', full_name: 'Stub Locked', supervisor_id: null, is_active: true },
    { employee_id: '2025006', full_name: 'Stub MustChange', supervisor_id: null, is_active: true },
    { employee_id: '2025007', full_name: 'Stub Inactive', supervisor_id: null, is_active: false },
  ];
  const LH_SESSION_CANARY = 'LH-SESSION-TOKEN-CANARY-9f3a';
  const profileFor = (id, roles, mustChangePin = false) => {
    const row = stubEmployees.find((e) => e.employee_id === id);
    return {
      employee_id: id,
      name: row ? row.full_name : 'Stub',
      mobile: '01700000001',
      designation: 'Field Associate',
      roles,
      must_change_pin: mustChangePin,
    };
  };
  const rpcCalls = { hub_verify_pin: 0, hub_staff_login: 0 };
  function stubRpc(fn, args) {
    rpcCalls[fn] = (rpcCalls[fn] || 0) + 1;
    if (fn === 'hub_verify_pin') {
      const { p_employee_id: id, p_pin: pin } = args;
      if (id === '2025001' && pin === '111111') {
        return { ok: true, token: LH_SESSION_CANARY, must_change_pin: false, profile: profileFor('2025001', ['learner']) };
      }
      if (id === '2025002' && pin === '222222') {
        return { ok: true, token: LH_SESSION_CANARY, must_change_pin: false, profile: profileFor('2025002', ['learner']) };
      }
      if (id === '2025003' && pin === '333333') {
        return { ok: true, token: LH_SESSION_CANARY, must_change_pin: false, profile: profileFor('2025003', ['supervisor']) };
      }
      if (id === '2025004' && pin === '444444') {
        return { ok: true, token: LH_SESSION_CANARY, must_change_pin: false, profile: profileFor('2025004', ['td_admin']) };
      }
      if (id === '2025005') {
        return { ok: false, code: 'locked', locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
      }
      if (id === '2025006' && pin === '666666') {
        return { ok: true, token: LH_SESSION_CANARY, must_change_pin: true, profile: profileFor('2025006', ['learner'], true) };
      }
      if (id === '2025007') return { ok: false, code: 'inactive' };
      if (id === '2025001') return { ok: false, code: 'invalid_pin', attempts_left: 3 };
      return { ok: false, code: 'invalid_pin' };
    }
    if (fn === 'hub_staff_login') {
      const { p_email: email, p_password: pw } = args;
      if (email === 'staff@shantalife.com' && pw === 'Password1') {
        return {
          ok: true,
          token: LH_SESSION_CANARY,
          must_change_password: false,
          profile: { ...profileFor('2025002', ['learner']), must_change_password: false },
        };
      }
      if (email === 'staff@shantalife.com') return { ok: false, code: 'invalid_password', attempts_left: 4 };
      return { ok: false, code: 'invalid_password' };
    }
    return { ok: false, code: 'unknown_function' };
  }
  const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const path = url.pathname;
    if (path === '/rest/v1/employees' && (init.method || 'GET') === 'GET') {
      return jsonRes(stubEmployees);
    }
    const rpcMatch = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path);
    if (rpcMatch && init.method === 'POST') {
      const args = JSON.parse(init.body);
      return jsonRes(stubRpc(rpcMatch[1], args));
    }
    return jsonRes({ message: 'stub: unknown route' }, 404);
  };

  const { default: handler } = await import('../api/hub-auth.js?stub=1');

  // Valid PIN login -> 200 + verifiable JWT, minimal user, no leaks.
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025001', credential: '111111' } }));
    check('handler: valid PIN -> 200 + token', res.statusCode === 200 && typeof json?.token === 'string', `status=${res.statusCode}`);
    const claims = json?.token ? verifySsoTokenNode(json.token, testVerifyConfig) : null;
    check(
      'handler: issued token verifies (sub/name/role/exp-iat=3600)',
      claims !== null && claims.sub === '2025001' && claims.name === 'Stub Agent' && claims.role === 'employee' && claims.exp - claims.iat === 3600,
      claims ? JSON.stringify(claims) : 'null',
    );
    check(
      'handler: user is minimal (no mobile, no token inside user)',
      json?.user?.employeeId === '2025001' && !('mobile' in (json?.user || {})) && !('token' in (json?.user || {})),
      JSON.stringify(json?.user),
    );
    check('handler: LH session token NEVER in the response', !res.body.includes(LH_SESSION_CANARY), '');
    check('handler: PIN never in the response', !res.body.includes('111111'), '');
    check('handler: profile.mobile never in the response', !res.body.includes('01700000001'), '');
    check('handler: Cache-Control private, no-store', res.headers['Cache-Control'] === 'private, no-store', res.headers['Cache-Control']);
  }
  // Role derivation end-to-end.
  {
    const { json: lead } = await callHandler(handler, mockReq({ body: { identifier: '2025002', credential: '222222' } }));
    const leadClaims = lead?.token ? verifySsoTokenNode(lead.token, testVerifyConfig) : null;
    check('handler: team_lead role derived', leadClaims?.role === 'team_lead', `role=${leadClaims?.role}`);
    const { json: mgr } = await callHandler(handler, mockReq({ body: { identifier: '2025003', credential: '333333' } }));
    const mgrClaims = mgr?.token ? verifySsoTokenNode(mgr.token, testVerifyConfig) : null;
    check('handler: manager role derived', mgrClaims?.role === 'manager', `role=${mgrClaims?.role}`);
    const { json: adm } = await callHandler(handler, mockReq({ body: { identifier: '2025004', credential: '444444' } }));
    const admClaims = adm?.token ? verifySsoTokenNode(adm.token, testVerifyConfig) : null;
    check('handler: admin role derived from td_admin marker', admClaims?.role === 'admin', `role=${admClaims?.role}`);
  }
  // Failure mapping.
  {
    const before = rpcCalls.hub_verify_pin;
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025001', credential: '123' } }));
    check('handler: bad PIN format -> 401 wrong_pin, RPC not called', res.statusCode === 401 && json?.error === 'wrong_pin' && rpcCalls.hub_verify_pin === before, `status=${res.statusCode}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025001', credential: '000000' } }));
    check('handler: wrong PIN -> 401 wrong_pin + attemptsLeft', res.statusCode === 401 && json?.error === 'wrong_pin' && json?.attemptsLeft === 3, `status=${res.statusCode} attemptsLeft=${json?.attemptsLeft}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025005', credential: '555555' } }));
    check('handler: locked -> 401 locked + minutes', res.statusCode === 401 && json?.error === 'locked' && json?.lockedMinutesLeft === 10, `status=${res.statusCode} minutes=${json?.lockedMinutesLeft}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025006', credential: '666666' } }));
    check(
      'handler: must-change -> 403, no token, LH change URL',
      res.statusCode === 403 && json?.error === 'must_change_credential' && typeof json?.token !== 'string' && String(json?.changeUrl || '').includes('shanta-life-learning-hub.vercel.app/login'),
      `status=${res.statusCode} error=${json?.error}`,
    );
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025007', credential: '777777' } }));
    check('handler: inactive -> 401 inactive', res.statusCode === 401 && json?.error === 'inactive', `status=${res.statusCode}`);
  }
  {
    const before = rpcCalls.hub_verify_pin;
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025999', credential: '123456' } }));
    check('handler: unknown ID -> 401 no_lms_record, RPC not called', res.statusCode === 401 && json?.error === 'no_lms_record' && rpcCalls.hub_verify_pin === before, `status=${res.statusCode}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '9990002', credential: '123456' } }));
    check('handler: 999 test ID -> 401 no_lms_record (hub-auth never mints tokens for unknown IDs)', res.statusCode === 401 && json?.error === 'no_lms_record', `status=${res.statusCode}`);
  }
  // Staff track.
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: 'staff@shantalife.com', credential: 'Password1' } }));
    const claims = json?.token ? verifySsoTokenNode(json.token, testVerifyConfig) : null;
    check('handler: staff email login -> 200 + token (sub 2025002)', res.statusCode === 200 && claims?.sub === '2025002' && claims?.role === 'team_lead', `status=${res.statusCode} sub=${claims?.sub}`);
    check('handler: staff response has no password + no LH session', !res.body.includes('Password1') && !res.body.includes(LH_SESSION_CANARY), '');
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: 'staff@shantalife.com', credential: 'WrongPass9' } }));
    check('handler: wrong staff password -> 401 wrong_pin + attemptsLeft', res.statusCode === 401 && json?.error === 'wrong_pin' && json?.attemptsLeft === 4, `status=${res.statusCode}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: 'nobody@shantalife.com', credential: 'WrongPass9' } }));
    check('handler: unknown email -> 401 wrong_pin, no attemptsLeft (no leak)', res.statusCode === 401 && json?.error === 'wrong_pin' && json?.attemptsLeft === undefined, `status=${res.statusCode}`);
  }
  // Method / body handling.
  {
    const { res, json } = await callHandler(handler, mockReq({ method: 'GET', body: null }));
    check('handler: GET -> 405', res.statusCode === 405 && json?.error === 'method_not_allowed', `status=${res.statusCode}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ rawBody: '{not json' }));
    check('handler: bad JSON -> 400', res.statusCode === 400 && json?.error === 'invalid_request', `status=${res.statusCode}`);
  }
  {
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025001' } }));
    check('handler: missing credential -> 400', res.statusCode === 400 && json?.error === 'invalid_request', `status=${res.statusCode}`);
  }
  // Production runtime guard at the handler level: production target
  // without a production key refuses to issue (500, not a dev token).
  {
    process.env.HUB_BUILD_TARGET = 'production';
    delete process.env.HUB_JWT_PRIVATE_KEY_B64;
    const { res, json } = await callHandler(handler, mockReq({ body: { identifier: '2025001', credential: '111111' } }));
    check('handler: production target + no HUB_ key -> 500 auth_not_configured', res.statusCode === 500 && json?.error === 'auth_not_configured', `status=${res.statusCode} error=${json?.error}`);
    delete process.env.HUB_BUILD_TARGET;
    process.env.HUB_JWT_PRIVATE_KEY_B64 = testPrivateB64;
  }

  globalThis.fetch = realFetch;
}

if (!hasLive) {
  console.log('\nLIVE AUTH — skipped (no env vars; live verification runs post-push).');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Auth live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
