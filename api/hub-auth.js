/**
 * POST /api/hub-auth — real sign-in for REAL employees (Phase 2, spec §10).
 *
 * The credential store is the LEARNING HUB — no new Hub auth DB
 * (spec §10.1). This serverless function verifies the credential
 * against the LH store and issues the Hub RS256 JWT server-side.
 * The browser never sees a hash, a service key, or the signing key.
 *
 * Tracks (one identifier field, LH pattern — the server routes by
 * identifier shape):
 * - PIN track (identifier is an Employee ID): `hub_verify_pin`
 *   (Employee ID + 6-digit PIN).
 * - Staff track (identifier contains '@'): `hub_staff_login`
 *   (official work email + password).
 * Both RPCs enforce the SAME lockout the Hub promises (5 wrong →
 * 15 min) — the Hub surfaces LH's message and builds NO second
 * lockout.
 *
 * `hub_verify_pin` / `hub_staff_login` mint a 30-day LH session as
 * a side effect (spec §15.3, Mahadi-approved): the Hub DISCARDS
 * that token — it is never returned, never stored, never logged.
 * The clean fix is a dedicated no-session verifier RPC (one small
 * LH migration, LH repo owns it); until it exists, the minted
 * sessions are inert (30-day expiry, pruned by LH on next login).
 *
 * Role derivation (spec §15.5): admin = LH user_roles td_admin /
 * super_admin (from the RPC profile.roles); manager = subtree
 * contains a team_lead; team_lead = >= 1 subordinate; else
 * employee. See api/_lib/hubRoles.js.
 *
 * Responses (minimal — never credential material, never the LH
 * session, never profile.mobile):
 * - 200 { user: { employeeId, name, role, mustChangeCredential:
 *   false }, token } — signed Hub JWT, 1 h.
 * - 401 { error: 'wrong_pin', attemptsLeft? } — wrong credential.
 * - 401 { error: 'locked', lockedMinutesLeft } — LH lockout.
 * - 401 { error: 'no_lms_record' } — the Employee ID has no LH
 *   employees row (e.g. a BE signing in with Employee code while
 *   the LH stub is keyed by BE code — spec §15.4). No role is
 *   invented; the caller is told to contact T&D.
 * - 401 { error: 'inactive' } — the employee record is inactive.
 * - 403 { error: 'must_change_credential', changeUrl } — LH flags
 *   a forced change: NO token is issued; the user changes the
 *   credential in the Learning Hub itself (the Hub builds no
 *   password-change flow for real users).
 * - 500/502 generic errors (never the upstream detail).
 */

import { supabaseConfig, supaGet, supaRpc } from './_lib/supabase.js';
import { deriveHubRole } from './_lib/hubRoles.js';
import { signingKeyConfig, signSsoTokenNode } from './_lib/signJwt.js';

export const config = { maxDuration: 30 };

const LEARNING_HUB_URL = 'https://shanta-life-learning-hub.vercel.app';
const CHANGE_URL = `${LEARNING_HUB_URL}/login`;
const EMPLOYEES_CACHE_MS = 5 * 60 * 1000;
const EMPLOYEES_FETCH_CAP = 5000;

let employeesCache = { rows: null, fetchedAtMs: 0 };

function cacheValid(entry) {
  return entry && entry.rows && Date.now() - entry.fetchedAtMs < EMPLOYEES_CACHE_MS;
}

/**
 * The LH employees roster (identity + reporting link only — no
 * credential, email, phone, or DOB column is ever selected).
 */
async function getEmployees(cfg) {
  if (cacheValid(employeesCache)) return employeesCache.rows;
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await supaGet(cfg, 'employees', {
      select: 'employee_id,full_name,supervisor_id,is_active',
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

const upper = (v) => String(v ?? '').trim().toUpperCase();
const isEmail = (identifier) => identifier.includes('@');
const isPinFormat = (credential) => /^\d{6}$/.test(credential);

/** Whole minutes from now until an LH locked_until timestamp (>= 1). */
function lockedMinutesLeft(lockedUntil) {
  const ms = Date.parse(lockedUntil);
  if (!Number.isFinite(ms)) return 15;
  return Math.max(1, Math.ceil((ms - Date.now()) / 60000));
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return send(res, 400, { error: 'invalid_request' });
  }
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const credential = typeof body?.credential === 'string' ? body.credential : '';
  if (!identifier || identifier.length > 254 || !credential || credential.length > 128) {
    return send(res, 400, { error: 'invalid_request' });
  }

  const cfg = supabaseConfig(process.env, 'LEARNINGHUB_SUPABASE_URL', 'LEARNINGHUB_SERVICE_ROLE_KEY');
  if (!cfg) {
    return send(res, 500, { error: 'auth_not_configured' });
  }

  let signing;
  try {
    signing = signingKeyConfig(process.env);
  } catch (err) {
    // Production runtime guard tripped (or an unusable key) — fail
    // closed without saying which. Never log the key or the detail.
    console.error('[hub-auth] signing unavailable');
    void err;
    return send(res, 500, { error: 'auth_not_configured' });
  }
  if (!signing) {
    return send(res, 500, { error: 'auth_not_configured' });
  }

  try {
    if (isEmail(identifier)) {
      return await staffTrack(cfg, signing, identifier, credential, res);
    }
    return await pinTrack(cfg, signing, identifier, credential, res);
  } catch (err) {
    // Never log the identifier, the credential, or the upstream
    // detail — only that the call failed.
    console.error('[hub-auth] sign-in failed');
    if (err && err.message && err.message.startsWith('supabase ')) {
      return send(res, 502, { error: 'learning_hub_unreachable' });
    }
    return send(res, 500, { error: 'could_not_sign_in' });
  }
}

/**
 * PIN track: Employee ID + 6-digit PIN via hub_verify_pin.
 * A missing LH employees row is a clear 401 'no_lms_record' —
 * checked BEFORE the RPC (the RPC would only say 'invalid_pin',
 * which hides the real problem from a BE whose stub is keyed by
 * BE code, spec §15.4).
 */
async function pinTrack(cfg, signing, employeeId, pin, res) {
  if (!isPinFormat(pin)) {
    return send(res, 401, { error: 'wrong_pin' });
  }
  const employees = await getEmployees(cfg);
  const row = employees.find((e) => upper(e.employee_id) === upper(employeeId));
  if (!row) {
    return send(res, 401, { error: 'no_lms_record' });
  }

  const result = await supaRpc(cfg, 'hub_verify_pin', {
    p_employee_id: employeeId,
    p_pin: pin,
  });
  if (!result || result.ok !== true) {
    return send(res, 401, mapRpcFailure(result));
  }
  // SUCCESS — the LH session token in result.token is DISCARDED
  // (spec §15.3): it is an LH session, not a Hub session.
  const profile = result.profile && typeof result.profile === 'object' ? result.profile : {};
  if (result.must_change_pin === true || profile.must_change_pin === true) {
    return send(res, 403, { error: 'must_change_credential', changeUrl: CHANGE_URL });
  }
  return issueToken(signing, employees, profile, row, res);
}

/**
 * Staff track: official work email + password via hub_staff_login.
 * Unknown emails are a generic 'wrong_pin' — LH deliberately does
 * not distinguish them (timing-parity bcrypt burn), and the Hub
 * keeps that property.
 */
async function staffTrack(cfg, signing, email, password, res) {
  if (!password) {
    return send(res, 401, { error: 'wrong_pin' });
  }
  const result = await supaRpc(cfg, 'hub_staff_login', {
    p_email: email,
    p_password: password,
  });
  if (!result || result.ok !== true) {
    return send(res, 401, mapRpcFailure(result));
  }
  // SUCCESS — the LH session token in result.token is DISCARDED
  // (spec §15.3).
  const profile = result.profile && typeof result.profile === 'object' ? result.profile : {};
  if (result.must_change_password === true || profile.must_change_password === true) {
    return send(res, 403, { error: 'must_change_credential', changeUrl: CHANGE_URL });
  }
  const employees = await getEmployees(cfg);
  const employeeId = String(profile.employee_id || '');
  const row = employees.find((e) => upper(e.employee_id) === upper(employeeId)) || null;
  if (!row) {
    // The RPC joins employees, so this should not happen — fail
    // closed rather than inventing a role.
    return send(res, 401, { error: 'no_lms_record' });
  }
  return issueToken(signing, employees, profile, row, res);
}

/** Map an LH RPC failure payload to the Hub's 401 error body. */
function mapRpcFailure(result) {
  const code = result && typeof result.code === 'string' ? result.code : '';
  if (code === 'locked') {
    return { error: 'locked', lockedMinutesLeft: lockedMinutesLeft(result.locked_until) };
  }
  if (code === 'inactive') {
    return { error: 'inactive' };
  }
  // invalid_pin / invalid_password / invalid_format / unknown shapes:
  // one generic wrong-credential answer, with attempts-left when LH
  // reports it.
  const out = { error: 'wrong_pin' };
  const left = typeof result?.attempts_left === 'number' ? result.attempts_left : null;
  if (left !== null && Number.isFinite(left) && left >= 0) out.attemptsLeft = Math.floor(left);
  return out;
}

/**
 * Derive the Hub role, sign the Hub JWT, return { user, token }.
 * Only employeeId/name/role leave the server — never the LH
 * profile (which carries mobile), never the LH session token.
 */
function issueToken(signing, employees, profile, row, res) {
  const employeeId = String(row.employee_id);
  const name = typeof profile.name === 'string' && profile.name
    ? profile.name
    : String(row.full_name || '');
  const role = deriveHubRole(employees, employeeId, profile.roles);
  const token = signSsoTokenNode({ sub: employeeId, name, role }, signing);
  return send(res, 200, {
    user: { employeeId, name, role, mustChangeCredential: false },
    token,
  });
}
