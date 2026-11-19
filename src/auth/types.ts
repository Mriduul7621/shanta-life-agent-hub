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
  | 'session_expired';

export interface AuthError {
  code: AuthErrorCode;
  /** Remaining wrong attempts before lockout (wrong_pin only). */
  attemptsLeft?: number;
  /** Whole minutes remaining on the lockout (locked only). */
  lockedMinutesLeft?: number;
}

export type SignInResult =
  | { ok: true; user: HubUser }
  | { ok: false; error: AuthError };

export type ChangeCredentialResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'mismatch' | 'same' };

/**
 * Auth provider interface. Milestone 1 ships two implementations:
 * - DemoAuthProvider (dev only, env-gated) — see demoProvider.ts
 * - SupabaseAuthProvider (stub) — see supabaseProvider.ts
 *
 * The provider authenticates the user; the Hub (AuthContext) issues the SSO
 * JWT from the verified identity. In production the token is issued by the
 * Supabase-backed auth service, never by client code — see docs/SSO_TOKEN.md.
 */
export interface AuthProvider {
  readonly id: 'demo' | 'supabase';
  readonly label: string;
  signIn(employeeId: string, credential: string): Promise<SignInResult>;
  changeCredential(
    employeeId: string,
    newCredential: string,
    confirmCredential: string,
  ): Promise<ChangeCredentialResult>;
}
