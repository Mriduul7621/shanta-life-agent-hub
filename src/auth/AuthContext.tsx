import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { HubAuthProvider } from './hubAuthProvider';
import { verifySsoToken } from './jwt';
import { HUB_PUBLIC_KEY_PEM } from './keys';
import type { AuthError, AuthProvider, HubUser } from './types';
import { clearRetailCache } from '../data/retailData';
import { clearLeadflowCache } from '../data/leadflowData';
import { clearLearningCache } from '../data/learningData';
import { syncPushSubscription } from '../native/push';

export const TOKEN_STORAGE_KEY = 'hub-session-token';
const SESSION_CHECK_MS = 30_000;

/**
 * One provider: HubAuthProvider posts /api/hub-auth and returns a
 * server-issued RS256 token. The browser never signs tokens — the
 * dev signing path left with the demo accounts (Mahadi 2026-11-20).
 */
export function selectProvider(): AuthProvider {
  return new HubAuthProvider();
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
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [provider] = useState<AuthProvider>(selectProvider);
  const [user, setUser] = useState<HubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSession = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    // The cached summaries are role-scoped real data — they must
    // never survive sign-out on a shared device.
    clearRetailCache();
    clearLeadflowCache();
    clearLearningCache();
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

  // Native push: keep the FCM topic subscription in step with the
  // session — subscribe on sign-in / session restore, unsubscribe on
  // sign-out / expiry. Gated on `restoring` so launch does not
  // unregister before the saved session is known. A no-op on web
  // (syncPushSubscription returns immediately off-native) and never
  // throws — push must never break auth.
  useEffect(() => {
    if (restoring) return;
    void syncPushSubscription(user, token);
  }, [user, token, restoring]);

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
      // The provider ALWAYS returns a server-issued token on success.
      // Verify it (signature + claims) before trusting it, and bind it
      // to the authenticated user — a token for someone else is rejected.
      // No token, no session: fail closed.
      let nextToken: string;
      try {
        const claims = await verifySsoToken(result.token, HUB_PUBLIC_KEY_PEM);
        if (!claims || claims.sub !== result.user.employeeId || claims.role !== result.user.role) {
          return { ok: false as const, error: { code: 'not_configured' as const } };
        }
        nextToken = result.token;
      } catch {
        // Verification failure — fail closed.
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

  const value = useMemo(
    () => ({ user, token, restoring, sessionExpired, provider, signIn, signOut }),
    [user, token, restoring, sessionExpired, provider, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProviderComponent>');
  return ctx;
}
