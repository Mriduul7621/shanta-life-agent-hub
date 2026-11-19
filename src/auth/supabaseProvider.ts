/**
 * Supabase auth provider — STUB (Milestone 2 design documented, not wired).
 *
 * The real implementation calls the Hub auth Edge Function, which verifies
 * the credential AND issues the SSO token server-side. The browser never
 * holds a signing key. Design (see docs/SSO_PRODUCTION.md for the full
 * sketch and deployment checklist):
 *
 * 1. signIn(employeeId, credential) → POST the Hub auth project's Edge
 *    Function `hub-auth` (endpoint `/auth/sign-in`) with
 *    `{ employeeId, credential }`. The function:
 *    - looks up the employee in the Hub auth schema (supabase/schema.sql —
 *      LOCAL ONLY, never run against any live database yet),
 *    - verifies the credential hash server-side (bcrypt/argon2 — never
 *      compare hashes in the browser),
 *    - enforces the same contract as the demo provider: 5 wrong attempts →
 *      15 minute lockout; must_change_credential forces a first-login change,
 *    - signs an RS256 SSO token with the PRODUCTION private key held in the
 *      Edge Function's server secrets (kid = the production kid),
 *    - returns `{ user, token }`. AuthContext uses the returned token
 *      instead of signing locally (see SignInResult.token in types.ts) and
 *      verifies it against the bundled production public key before
 *      trusting it.
 * 2. changeCredential(employeeId, new, confirm) → POST `/auth/change-credential`
 *    with the current session token + the new credential; the Edge Function
 *    re-hashes server-side and updates must_change_credential.
 * 3. Sessions expire after 1 hour (the token's exp); there is no refresh
 *    token — after expiry the agent signs in again.
 *
 * Until the Edge Function exists, every method returns `not_configured`, so
 * a build without VITE_DEMO_AUTH=true fails closed instead of silently
 * accepting logins. NO live Supabase work has been done from this repo.
 */
import type { AuthProvider, ChangeCredentialResult, SignInResult } from './types';

export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase' as const;
  readonly label = 'Supabase (not wired yet)';

  async signIn(): Promise<SignInResult> {
    // TODO: call the Hub auth Edge Function; return { ok: true, user, token }
    // with the server-issued RS256 token. See the file header + docs/SSO_PRODUCTION.md.
    return { ok: false, error: { code: 'not_configured' } };
  }

  async changeCredential(): Promise<ChangeCredentialResult> {
    // TODO: call the Hub credential-change Edge Function.
    return { ok: false, error: 'invalid' };
  }
}
