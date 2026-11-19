/**
 * Demo auth provider — DEV ONLY.
 *
 * Gated by VITE_DEMO_AUTH=true (see src/auth/AuthContext.tsx). Never enabled
 * in a production build. All four users are fictional (999xxxx IDs); no real
 * employee ID or credential exists anywhere in this repo.
 *
 * Behaviour mirrors the Learning Hub login contract from Plan A:
 * - 5 wrong attempts locks the account for 15 minutes (persisted in
 *   localStorage so a reload does not reset the lockout).
 * - User 9990001 signs in with a temporary PIN and must set a new one on
 *   first login (forced-change flow).
 * - Changed PINs are stored in localStorage (demo only — a real provider
 *   hashes server-side; see supabase/schema.sql).
 */
import type { AuthProvider, ChangeCredentialResult, HubUser, Role, SignInResult } from './types';

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const DEMO_PIN = '123456';

interface DemoUserSeed {
  employeeId: string;
  name: string;
  role: Role;
  mustChangeCredential: boolean;
}

export const DEMO_USERS: DemoUserSeed[] = [
  { employeeId: '9990001', name: 'Demo Agent', role: 'employee', mustChangeCredential: true },
  { employeeId: '9990002', name: 'Demo Team Lead', role: 'team_lead', mustChangeCredential: false },
  { employeeId: '9990003', name: 'Demo Manager', role: 'manager', mustChangeCredential: false },
  { employeeId: '9990004', name: 'Demo Admin', role: 'admin', mustChangeCredential: false },
];

const lockKey = (id: string) => `hub-demo-lockout-${id}`;
const pinKey = (id: string) => `hub-demo-pin-${id}`;
const changedKey = (id: string) => `hub-demo-pin-changed-${id}`;

interface LockState {
  attempts: number;
  lockedUntilMs: number | null;
}

function readLock(id: string): LockState {
  try {
    const raw = localStorage.getItem(lockKey(id));
    if (raw) {
      const parsed = JSON.parse(raw) as LockState;
      if (typeof parsed.attempts === 'number') return parsed;
    }
  } catch {
    /* corrupted state — treat as fresh */
  }
  return { attempts: 0, lockedUntilMs: null };
}

function writeLock(id: string, state: LockState) {
  try {
    localStorage.setItem(lockKey(id), JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

function readPin(id: string): string {
  try {
    return localStorage.getItem(pinKey(id)) ?? DEMO_PIN;
  } catch {
    return DEMO_PIN;
  }
}

function hasChangedPin(id: string): boolean {
  try {
    return localStorage.getItem(changedKey(id)) === '1';
  } catch {
    return false;
  }
}

export class DemoAuthProvider implements AuthProvider {
  readonly id = 'demo' as const;
  readonly label = 'Demo (dev only)';

  async signIn(employeeId: string, credential: string): Promise<SignInResult> {
    const id = employeeId.trim();
    const seed = DEMO_USERS.find((u) => u.employeeId === id);
    if (!seed) return { ok: false, error: { code: 'unknown_user' } };

    const lock = readLock(id);
    if (lock.lockedUntilMs && lock.lockedUntilMs > Date.now()) {
      const minutesLeft = Math.ceil((lock.lockedUntilMs - Date.now()) / 60000);
      return { ok: false, error: { code: 'locked', lockedMinutesLeft: minutesLeft } };
    }
    // Lockout expired — reset the counter.
    if (lock.lockedUntilMs && lock.lockedUntilMs <= Date.now()) {
      writeLock(id, { attempts: 0, lockedUntilMs: null });
      lock.attempts = 0;
      lock.lockedUntilMs = null;
    }

    if (credential !== readPin(id)) {
      const attempts = lock.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntilMs = Date.now() + LOCKOUT_MINUTES * 60000;
        writeLock(id, { attempts, lockedUntilMs });
        return { ok: false, error: { code: 'locked', lockedMinutesLeft: LOCKOUT_MINUTES } };
      }
      writeLock(id, { attempts, lockedUntilMs: null });
      return { ok: false, error: { code: 'wrong_pin', attemptsLeft: MAX_ATTEMPTS - attempts } };
    }

    writeLock(id, { attempts: 0, lockedUntilMs: null });
    const user: HubUser = {
      employeeId: seed.employeeId,
      name: seed.name,
      role: seed.role,
      mustChangeCredential: seed.mustChangeCredential && !hasChangedPin(id),
    };
    return { ok: true, user };
  }

  async changeCredential(
    employeeId: string,
    newCredential: string,
    confirmCredential: string,
  ): Promise<ChangeCredentialResult> {
    if (!/^\d{6}$/.test(newCredential)) return { ok: false, error: 'invalid' };
    if (newCredential !== confirmCredential) return { ok: false, error: 'mismatch' };
    if (newCredential === readPin(employeeId)) return { ok: false, error: 'same' };
    try {
      localStorage.setItem(pinKey(employeeId), newCredential);
      localStorage.setItem(changedKey(employeeId), '1');
    } catch {
      /* storage unavailable — change cannot persist; still report success for the session */
    }
    return { ok: true };
  }
}
