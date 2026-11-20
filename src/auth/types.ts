export type Role = 'employee' | 'team_lead' | 'manager' | 'admin';

export interface HubUser {
  employeeId: string;
  name: string;
  role: Role;
  /** True when the user signed in with a temporary credential and must set a new one. */
  mustChangeCredential: boolean;
}

export type AuthErrorCode =
  | 'wrong_pin'
  | 'unknown_user'
  | 'locked'
  | 'not_configured'
  | 'session_expired'
  /** The Employee ID has no Learning Hub employees row (api/hub-auth). */
  | 'no_lms_record'
  /** The Learning Hub employee record is inactive. */
  | 'inactive'
  /** LH flags a forced credential change — change it in the Learning Hub. */
  | 'must_change'
  /** The auth endpoint answered with a server error (LH unreachable, etc.). */
  | 'unavailable';

export interface AuthError {
  code: AuthErrorCode;
  /** Remaining wrong attempts before lockout (wrong_pin only). */
  attemptsLeft?: number;
  /** Whole minutes remaining on the lockout (locked only). */
  lockedMinutesLeft?: number;
}

export type SignInResult =
  | {
      ok: true;
      user: HubUser;
      /**
       * Server-issued RS256 SSO token (PRODUCTION path). When a provider
       * returns one, AuthContext uses it instead of signing locally — and
       * verifies it (signature + claims) before trusting it. The demo
       * provider never returns a token, so dev/QA builds keep signing
       * locally with the dev-only key. See docs/SSO_PRODUCTION.md.
       */
      token?: string;
    }
  | { ok: false; error: AuthError };

export type ChangeCredentialResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'mismatch' | 'same' };

/**
 * Auth provider interface.
 * - DemoAuthProvider (dev only, env-gated) — see demoProvider.ts. Returns no
 *   token; the Hub signs a demo token locally with the dev-only key.
 * - HubAuthProvider (see hubAuthProvider.ts) — the real implementation. It
 *   POSTs the Hub-side serverless function `/api/hub-auth`, which verifies
 *   the credential against the Learning Hub store server-side and returns a
 *   server-issued RS256 token in `SignInResult.token`; AuthContext then uses
 *   that token instead of signing locally. The browser never holds a signing
 *   key in production — see docs/SSO_PRODUCTION.md. In QA/dev builds with
 *   demo auth enabled, 999xxxx identifiers are routed to the demo provider
 *   instead, so demo sign-in keeps working alongside real sign-in.
 *
 * The provider authenticates the user; the SSO JWT comes either from the
 * provider (real auth) or from local dev signing (demo only).
 */
export interface AuthProvider {
  readonly id: 'demo' | 'hub';
  readonly label: string;
  signIn(employeeId: string, credential: string): Promise<SignInResult>;
  changeCredential(
    employeeId: string,
    newCredential: string,
    confirmCredential: string,
  ): Promise<ChangeCredentialResult>;
}
