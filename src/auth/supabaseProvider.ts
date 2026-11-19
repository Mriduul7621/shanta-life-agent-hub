/**
 * Supabase auth provider — STUB (Milestone 1).
 *
 * The real implementation lands in Milestone 2. It will:
 * 1. Connect to the dedicated Hub auth Supabase project (schema prepared at
 *    supabase/schema.sql — NOT run against any live database yet).
 * 2. Verify Employee ID + credential hash server-side (bcrypt/argon2 via a
 *    Supabase Edge Function — never compare hashes in the browser).
 * 3. Enforce the same contract as the demo provider: 5 wrong attempts → 15
 *    minute lockout; must_change_credential forces a first-login change;
 *    sessions expire after 1 hour.
 * 4. Issue the SSO JWT server-side with the production signing secret
 *    (see docs/SSO_TOKEN.md). The browser must never hold the secret.
 *
 * Until then every method returns `not_configured`, so a build without
 * VITE_DEMO_AUTH=true fails closed instead of silently accepting logins.
 */
import type { AuthProvider, ChangeCredentialResult, SignInResult } from './types';

export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase' as const;
  readonly label = 'Supabase (not wired yet)';

  async signIn(): Promise<SignInResult> {
    // TODO (Milestone 2): call the Hub auth Edge Function.
    return { ok: false, error: { code: 'not_configured' } };
  }

  async changeCredential(): Promise<ChangeCredentialResult> {
    // TODO (Milestone 2): call the Hub credential-change Edge Function.
    return { ok: false, error: 'invalid' };
  }
}
