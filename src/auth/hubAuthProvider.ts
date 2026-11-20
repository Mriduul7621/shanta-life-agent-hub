/**
 * Hub auth provider — the ONLY sign-in (Phase 2, spec §10).
 *
 * POSTs the Hub-side serverless function `/api/hub-auth` (same origin),
 * which verifies the credential against the Learning Hub store
 * server-side and returns a server-issued RS256 token. The browser
 * never holds a signing key, a hash, or a service key — see
 * docs/SSO_PRODUCTION.md.
 *
 * One identifier field (LH pattern): an Employee ID routes to the
 * PIN track, an email address routes to the staff-password track —
 * the routing happens server-side (api/hub-auth.js); this provider
 * just sends { identifier, credential }.
 *
 * NO demo path: the demo accounts were removed entirely (Mahadi
 * 2026-11-20), and the proxy fixture gates went with them — a
 * 999xxxx identifier goes to /api/hub-auth like any other ID and
 * fails there (no such LH row), and the proxies treat a 999xxxx
 * caller like any unknown ID. The QA harness signs test tokens in
 * Node and seeds session caches directly (scripts/qa-screenshots.mjs).
 *
 * Error mapping (api/hub-auth.js error bodies → AuthError codes):
 * - 401 wrong_pin (+attemptsLeft) / locked (+lockedMinutesLeft) —
 *   LH's own lockout, surfaced as-is. No second lockout is built.
 * - 401 no_lms_record / inactive — plain-language guidance to T&D.
 * - 403 must_change_credential — LH flags a forced change: no Hub
 *   session is created; the user changes the credential in the
 *   Learning Hub itself (the Hub builds no password-change flow).
 * - 5xx / malformed response → 'unavailable' (try again later).
 * - fetch throws (no API server reachable at all — e.g. the
 *   production-build QA harness, or a broken deployment) →
 *   'not_configured': sign-in is not available in this build.
 */
import type { AuthProvider, HubUser, SignInResult } from './types';

const AUTH_URL = '/api/hub-auth';
const FETCH_TIMEOUT_MS = 30_000;

function isValidUser(value: unknown): value is HubUser {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.employeeId === 'string' &&
    u.employeeId.length > 0 &&
    typeof u.name === 'string' &&
    typeof u.role === 'string' &&
    (u.role === 'employee' || u.role === 'team_lead' || u.role === 'manager' || u.role === 'admin') &&
    typeof u.mustChangeCredential === 'boolean'
  );
}

export class HubAuthProvider implements AuthProvider {
  readonly id = 'hub' as const;
  readonly label = 'Agent Hub';

  async signIn(identifier: string, credential: string): Promise<SignInResult> {
    const id = identifier.trim();

    let res: Response;
    try {
      res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id, credential }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      // No API server reachable at all — fail closed as not configured.
      return { ok: false, error: { code: 'not_configured' } };
    }

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const body = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const error = typeof body.error === 'string' ? body.error : '';

    if (res.ok) {
      if (typeof body.token === 'string' && body.token && isValidUser(body.user)) {
        return { ok: true, user: body.user, token: body.token };
      }
      return { ok: false, error: { code: 'unavailable' } };
    }

    if (res.status === 401) {
      if (error === 'wrong_pin') {
        const attemptsLeft = typeof body.attemptsLeft === 'number' ? body.attemptsLeft : undefined;
        return { ok: false, error: { code: 'wrong_pin', attemptsLeft } };
      }
      if (error === 'locked') {
        const lockedMinutesLeft =
          typeof body.lockedMinutesLeft === 'number' ? body.lockedMinutesLeft : 15;
        return { ok: false, error: { code: 'locked', lockedMinutesLeft } };
      }
      if (error === 'no_lms_record') return { ok: false, error: { code: 'no_lms_record' } };
      if (error === 'inactive') return { ok: false, error: { code: 'inactive' } };
      return { ok: false, error: { code: 'wrong_pin' } };
    }
    if (res.status === 403 && error === 'must_change_credential') {
      return { ok: false, error: { code: 'must_change' } };
    }
    return { ok: false, error: { code: 'unavailable' } };
  }
}
