/**
 * Retail Sales Dashboard fetch (browser side).
 *
 * The Dashboard page does NOT fetch retail data directly: the workbook is
 * private (gviz 401) and the retail endpoint sends no CORS headers. It
 * calls the Hub-side proxy same-origin (`/api/retail-data`, see
 * api/retail-data.js) with the Hub JWT; the proxy verifies the token,
 * fetches the retail payload server-to-server, and returns ONLY the
 * computed summary for the caller's visible slice (spec §9 — server-side
 * scoping is a MUST). The browser never receives raw rows.
 *
 * Caching: the summary is kept in sessionStorage for this browser session
 * (stale-while-revalidate — the Dashboard shows cached data immediately
 * and refreshes in the background). NOTHING is persisted across sessions.
 * The cache is bound to the signed-in Employee ID: a cached summary for
 * another user is ignored, and sign-out clears it (see AuthContext) —
 * scoped data must never leak across users on a shared device.
 * The cache key also includes the time-frame period: one period's
 * summary must never be shown for another period.
 */
import { DEFAULT_PERIOD, PERIODS, type Period } from './period';

export type RetailScope = 'own' | 'team' | 'subtree' | 'org';

export interface RetailLeaderboardEntry {
  name: string;
  premium: number;
  policies: number;
}

export interface RetailSummary {
  /** True when the summary comes from the synthetic demo slice. */
  demo: boolean;
  scope: RetailScope;
  role: string;
  /** The period this summary was computed for ('all' = no filtering). */
  period: Period;
  /** { start, end } ISO dates of the period window, null for 'all'. */
  periodWindow: { start: string; end: string } | null;
  userCode: string | null;
  userName: string | null;
  userTier: string | null;
  /** True when the visible scope holds no data at all. */
  empty: boolean;
  /** 'no-code': no producer code is linked to this Employee ID. 'no-rows': linked, but no business yet. */
  emptyReason: 'no-code' | 'no-rows' | null;
  totalPremium: number;
  /** Deferred / Renewal share of total premium (%), null when total is 0. */
  deferredRatio: number | null;
  renewalRatio: number | null;
  fycp: number;
  policies: number;
  duePremium: number;
  duePolicies: number;
  /** 'YYYY-MM' — the month the Due Premium figure covers. */
  dueMonth: string;
  persistency: { pct: number; inf: number; all: number } | null;
  activeFas: { active: number; total: number };
  leaderboard: { kind: 'reports' | 'bes' | 'none'; entries: RetailLeaderboardEntry[] };
  unassigned: { premium: number; policies: number } | null;
  /** Epoch ms of the retail payload's last sync (or the fetch time). */
  syncedAt: number;
  periodEnd: string | null;
}

export interface RetailLoadResult {
  summary: RetailSummary;
  /** Epoch ms of the successful fetch (or of the cached fetch). */
  syncedAt: number;
  fromCache: boolean;
}

const CACHE_KEY = 'hub-retail-cache-v1';
const FETCH_TIMEOUT_MS = 30_000;

interface RetailCache {
  summary: RetailSummary;
  employeeId: string;
  syncedAt: number;
}

function isValidSummary(value: unknown): value is RetailSummary {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.demo === 'boolean' &&
    typeof s.scope === 'string' &&
    typeof s.totalPremium === 'number' &&
    typeof s.fycp === 'number' &&
    typeof s.policies === 'number' &&
    typeof s.duePremium === 'number' &&
    typeof s.empty === 'boolean' &&
    typeof s.activeFas === 'object' &&
    s.activeFas !== null &&
    typeof s.leaderboard === 'object' &&
    s.leaderboard !== null
  );
}

function cacheKey(period: Period): string {
  return `${CACHE_KEY}:${period}`;
}

function readCache(employeeId: string, period: Period): RetailCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(period));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetailCache;
    if (parsed.employeeId !== employeeId) return null;
    if (typeof parsed.syncedAt !== 'number' || !isValidSummary(parsed.summary)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: RetailCache, period: Period): void {
  try {
    sessionStorage.setItem(cacheKey(period), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the page still works, just without a cache.
  }
}

/** Clear the cached Dashboard summaries for ALL periods (sign-out, user switch). Never throws. */
export function clearRetailCache(): void {
  try {
    for (const period of PERIODS) sessionStorage.removeItem(cacheKey(period));
    sessionStorage.removeItem(CACHE_KEY); // pre-filter cache key, if any
  } catch {
    /* ignore */
  }
}

function toResult(cache: RetailCache, fromCache: boolean): RetailLoadResult {
  return { summary: cache.summary, syncedAt: cache.syncedAt, fromCache };
}

/** Cached data for instant display (null on first visit). Never throws. */
export function loadRetailCached(employeeId: string, period: Period = DEFAULT_PERIOD): RetailLoadResult | null {
  const cache = readCache(employeeId, period);
  return cache ? toResult(cache, true) : null;
}

/**
 * Fresh fetch from the Hub proxy. Throws on any failure (including 401 —
 * the caller's token is missing or expired; AuthContext's expiry checker
 * signs the session out separately).
 */
export async function loadRetailFresh(token: string, employeeId: string, period: Period = DEFAULT_PERIOD): Promise<RetailLoadResult> {
  const res = await fetch(`/api/retail-data?period=${period}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`retail-data: HTTP ${res.status}`);
  const summary: unknown = await res.json();
  if (!isValidSummary(summary)) throw new Error('retail-data: unexpected response shape');
  const cache: RetailCache = { summary, employeeId, syncedAt: Date.now() };
  writeCache(cache, period);
  return toResult(cache, false);
}
