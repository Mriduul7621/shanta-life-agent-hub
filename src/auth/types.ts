export type Role = 'employee' | 'team_lead' | 'manager' | 'admin';

export interface HubUser {
  employeeId: string;
  name: string;
  role: Role;
  /**
   * True when the user signed in with a temporary credential and must
   * set a new one. Always false for Hub sessions — a forced change
   * returns 403 must_change_credential from /api/hub-auth with NO
   * token, so the user changes it in the Learning Hub instead. The
   * field stays because the server sends it (isValidUser checks it).
   */
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
       * Server-issued RS256 SSO token. ALWAYS present on success —
       * AuthContext verifies it (signature + claims) before trusting
       * it. The browser never signs tokens: the dev signing path was
       * removed with the demo accounts (Mahadi 2026-11-20). The QA
       * harness signs test tokens in Node (scripts/qa-screenshots.mjs
       * bundles src/auth/jwt.ts for that).
       */
      token: string;
    }
  | { ok: false; error: AuthError };

/**
 * Auth provider interface — one implementation: HubAuthProvider
 * (see hubAuthProvider.ts). It POSTs the Hub-side serverless
 * function `/api/hub-auth`, which verifies the credential against
 * the Learning Hub store server-side and returns a server-issued
 * RS256 token in `SignInResult.token`. The browser never holds a
 * signing key — see docs/SSO_PRODUCTION.md. The demo provider was
 * removed entirely (Mahadi 2026-11-20); there is no credential-change
 * flow in the Hub — a forced change routes the user to the Learning
 * Hub at sign-in.
 */
export interface AuthProvider {
  readonly id: 'hub';
  readonly label: string;
  signIn(employeeId: string, credential: string): Promise<SignInResult>;
}
