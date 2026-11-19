import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DemoAuthProvider } from './demoProvider';
import { SupabaseAuthProvider } from './supabaseProvider';
import { signSsoToken, verifySsoToken } from './jwt';
import type { AuthError, AuthProvider, HubUser } from './types';

export const TOKEN_STORAGE_KEY = 'hub-session-token';
const SESSION_CHECK_MS = 30_000;

export const isDemoAuthEnabled = import.meta.env.VITE_DEMO_AUTH === 'true';

/** DEV-ONLY signing secret. Production tokens are issued server-side — see docs/SSO_TOKEN.md. */
const devJwtSecret: string | undefined = import.meta.env.VITE_JWT_SECRET as string | undefined;

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
    setUser(null);
    setToken(null);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSessionExpired(false);
  }, [clearSession]);

  // Restore a saved session on load: verify signature + expiry before trusting it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      } catch {
        saved = null;
      }
      if (saved && devJwtSecret) {
        const claims = await verifySsoToken(saved, devJwtSecret);
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
      } else if (saved && !devJwtSecret) {
        // No secret configured — cannot verify, so fail closed.
        clearSession();
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Periodic expiry check: the 1-hour session ends even if the tab stays open.
  useEffect(() => {
    if (!token || !devJwtSecret) return;
    const id = window.setInterval(() => {
      void verifySsoToken(token, devJwtSecret).then((claims) => {
        if (!claims) {
          clearSession();
          setSessionExpired(true);
        }
      });
    }, SESSION_CHECK_MS);
    return () => window.clearInterval(id);
  }, [token, clearSession]);

  const signIn = useCallback(
    async (employeeId: string, credential: string) => {
      const result = await provider.signIn(employeeId, credential);
      if (!result.ok) return { ok: false as const, error: result.error };
      if (!devJwtSecret) {
        return { ok: false as const, error: { code: 'not_configured' as const } };
      }
      const nextToken = await signSsoToken(
        { sub: result.user.employeeId, name: result.user.name, role: result.user.role },
        devJwtSecret,
      );
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
