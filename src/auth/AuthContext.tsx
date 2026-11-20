import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DemoAuthProvider } from './demoProvider';
import { SupabaseAuthProvider } from './supabaseProvider';
import { signSsoToken, verifySsoToken } from './jwt';
import { HUB_PUBLIC_KEY_PEM } from './keys';
import type { AuthError, AuthProvider, HubUser } from './types';
import { clearRetailCache } from '../data/retailData';

export const TOKEN_STORAGE_KEY = 'hub-session-token';
const SESSION_CHECK_MS = 30_000;

export const isDemoAuthEnabled = import.meta.env.VITE_DEMO_AUTH === 'true';

/**
 * DEV-ONLY RS256 signing key (PKCS#8 DER, base64). Signs demo tokens in
 * dev/QA builds ONLY. Production tokens are issued server-side — the browser
 * never holds a signing key, and the production-target build guard in
 * vite.config.ts refuses to build when any VITE_JWT_* variable is set.
 * See docs/SSO_TOKEN.md and docs/SSO_PRODUCTION.md.
 */
const devPrivateKeyB64: string | undefined = import.meta.env.VITE_JWT_PRIVATE_KEY_B64 as string | undefined;

export function selectProvider(): AuthProvider {
  return isDemoAuthEnabled ? new DemoAuthProvider() : new SupabaseAuthProvider();
}

interface AuthValue {
  user: HubUser | null;
  token: string | null;
  /** True while the saved session is being restored on first load. */
  restoring: boolean;
  /** Set when a saved session was found but had expired. */
  sessionExpired: boolean;
  provider: AuthProvider;
  signIn: (employeeId: string, credential: string) => Promise<{ ok: true } | { ok: false; error: AuthError }>;
  changeCredential: (next: string, confirm: string) => Promise<{ ok: true } | { ok: false; error: 'invalid' | 'mismatch' | 'same' }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [provider] = useState<AuthProvider>(selectProvider);
  const [user, setUser] = useState<HubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<HubUser | null>(null);
  userRef.current = user;

  const clearSession = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    // The cached Dashboard summary is role-scoped real data (or the demo
    // slice) — it must never survive sign-out on a shared device.
    clearRetailCache();
    setUser(null);
    setToken(null);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSessionExpired(false);
    // Same-tab navigation (Milestone 2 follow-up): there is no second
    // window to notify, so Hub sign-out cannot reach a module the agent
    // already navigated to. Module sessions end at token expiry (≤ 1 h) —
    // see src/sso/handoff.ts. This is expected, not a failure.
  }, [clearSession]);

  // Restore a saved session on load: verify signature + claims against the
  // bundled PUBLIC key before trusting it. No signing key is needed to
  // verify, so restore works in every build.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      } catch {
        saved = null;
      }
      if (saved) {
        const claims = await verifySsoToken(saved, HUB_PUBLIC_KEY_PEM);
        if (cancelled) return;
        if (claims) {
          setUser({
            employeeId: claims.sub,
            name: claims.name,
            role: claims.role as HubUser['role'],
            mustChangeCredential: false,
          });
          setToken(saved);
        } else {
          // Invalid or expired token — clear it; expired sessions show a notice.
          clearSession();
          setSessionExpired(true);
        }
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Periodic expiry check: the 1-hour session ends even if the tab stays open.
  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      void verifySsoToken(token, HUB_PUBLIC_KEY_PEM).then((claims) => {
        if (!claims) {
          clearSession();
          setSessionExpired(true);
          // Same-tab: no module window to notify (see signOut above).
          // Module sessions end at the same token expiry.
        }
      });
    }, SESSION_CHECK_MS);
    return () => window.clearInterval(id);
  }, [token, clearSession]);

  const signIn = useCallback(
    async (employeeId: string, credential: string) => {
      const result = await provider.signIn(employeeId, credential);
      if (!result.ok) return { ok: false as const, error: result.error };
      let nextToken: string | null = null;
      try {
        if (result.token) {
          // PRODUCTION PATH: the provider returned a server-issued token.
          // Verify it (signature + claims) before trusting it, and bind it
          // to the authenticated user — a token for someone else is rejected.
          const claims = await verifySsoToken(result.token, HUB_PUBLIC_KEY_PEM);
          if (!claims || claims.sub !== result.user.employeeId || claims.role !== result.user.role) {
            return { ok: false as const, error: { code: 'not_configured' as const } };
          }
          nextToken = result.token;
        } else if (devPrivateKeyB64) {
          // DEV PATH: sign locally with the dev-only key.
          nextToken = await signSsoToken(
            { sub: result.user.employeeId, name: result.user.name, role: result.user.role },
            devPrivateKeyB64,
          );
        } else {
          // No server token and no dev signing key — fail closed.
          return { ok: false as const, error: { code: 'not_configured' as const } };
        }
      } catch {
        // Signing/verification failure (e.g. a malformed dev key) — fail closed.
        return { ok: false as const, error: { code: 'not_configured' as const } };
      }
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      } catch {
        /* session-only fallback: token still held in memory */
      }
      setSessionExpired(false);
      setUser(result.user);
      setToken(nextToken);
      return { ok: true as const };
    },
    [provider],
  );

  const changeCredential = useCallback(
    async (next: string, confirm: string) => {
      const current = userRef.current;
      if (!current) return { ok: false as const, error: 'invalid' as const };
      const result = await provider.changeCredential(current.employeeId, next, confirm);
      if (!result.ok) return { ok: false as const, error: result.error };
      setUser({ ...current, mustChangeCredential: false });
      return { ok: true as const };
    },
    [provider],
  );

  const value = useMemo(
    () => ({ user, token, restoring, sessionExpired, provider, signIn, changeCredential, signOut }),
    [user, token, restoring, sessionExpired, provider, signIn, changeCredential, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProviderComponent>');
  return ctx;
}
