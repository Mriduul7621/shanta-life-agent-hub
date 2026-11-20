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
import {
  DEFAULT_SELECTION,
  selectionCacheSuffix,
  selectionQuery,
  type Period,
  type PeriodSelection,
} from './period';
import { fetchProxyJson } from './fetchWithRetry';

export type RetailScope = 'own' | 'team' | 'subtree' | 'org';

export interface RetailLeaderboardEntry {
  name: string;
  premium: number;
  policies: number;
}

/** One recent due row (Home Due widget) — owner, due date, premium only. */
export interface RetailDueRow {
  owner: string;
  nextDue: string;
  premium: number;
}

export interface RetailSummary {
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
  /** Raw New / Deferred premium sums (FYCP = new + deferred) — the Home FYCP card's sub-text.
   * Added in c48ac65; an older deployment's proxy response has neither
   * field — normalizeSummary() defaults them to 0 (see isValidSummary). */
  newPremium: number;
  deferredPremium: number;
  policies: number;
  duePremium: number;
  duePolicies: number;
  /** 'YYYY-MM' — the month the Due Premium figure covers. */
  dueMonth: string;
  /** The month-to-date window Due Premium covers ({ start, end } ISO
   *  dates). Absent from older proxy responses — the UI falls back
   *  to the due month label. */
  dueWindow?: { start: string; end: string };
  /** This week's dues (Bangladesh calendar week, Sunday–Saturday):
   *  distinct-policy count + amount, with the week range. Absent
   *  from older proxy responses — the Home dues card falls back to
   *  the month figures. */
  duesThisWeek?: { count: number; amount: number; weekStart: string; weekEnd: string };
  /** The 3 most recent dues (nearest due date first) for the Home
   *  Due widget. Absent from older proxy responses — the widget
   *  shows only the totals. Each row is owner name + due date +
   *  premium only (no policy number, no mobile — the payload has
   *  no mobile field). */
  dueRows?: RetailDueRow[];
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

/**
 * Mixed-version tolerance (2026-11-20): the c48ac65 client added the
 * newPremium/deferredPremium fields, but an older deployment's proxy
 * response has neither. A browser running the new bundle against the
 * old proxy (Vercel skew pin from an earlier session) failed this
 * validation and the whole retail feed was lost — while
 * LeadFlow/Learning stayed up, because their shapes did not change.
 * These two fields are therefore OPTIONAL here: absent (or a
 * non-number) is accepted and normalizeSummary() defaults them to 0,
 * so the transient mixed-version state shows New ৳0 · Deferred ৳0 on
 * the FYCP card instead of losing the entire feed. Every other
 * required check is unchanged.
 */
function isValidSummary(value: unknown): value is RetailSummary {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.scope === 'string' &&
    typeof s.totalPremium === 'number' &&
    typeof s.fycp === 'number' &&
    (s.newPremium === undefined || typeof s.newPremium === 'number') &&
    (s.deferredPremium === undefined || typeof s.deferredPremium === 'number') &&
    typeof s.policies === 'number' &&
    typeof s.duePremium === 'number' &&
    typeof s.empty === 'boolean' &&
    typeof s.activeFas === 'object' &&
    s.activeFas !== null &&
    typeof s.leaderboard === 'object' &&
    s.leaderboard !== null
  );
}

/** Fill the optional new/deferred premium fields with 0 when absent (old-proxy shape). */
function normalizeSummary(summary: RetailSummary): RetailSummary {
  return {
    ...summary,
    newPremium: typeof summary.newPremium === 'number' ? summary.newPremium : 0,
    deferredPremium: typeof summary.deferredPremium === 'number' ? summary.deferredPremium : 0,
  };
}

function cacheKey(selection: PeriodSelection): string {
  return `${CACHE_KEY}:${selectionCacheSuffix(selection)}`;
}

function readCache(employeeId: string, selection: PeriodSelection): RetailCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(selection));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetailCache;
    if (parsed.employeeId !== employeeId) return null;
    if (typeof parsed.syncedAt !== 'number' || !isValidSummary(parsed.summary)) return null;
    // A cache entry written by an older client may lack the new/deferred
    // fields — normalize so consumers always see numbers.
    return { ...parsed, summary: normalizeSummary(parsed.summary) };
  } catch {
    return null;
  }
}

function writeCache(cache: RetailCache, selection: PeriodSelection): void {
  try {
    sessionStorage.setItem(cacheKey(selection), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the page still works, just without a cache.
  }
}

/**
 * Clear the cached Dashboard summaries for ALL periods (sign-out, user
 * switch). Never throws. Iterates by key prefix — custom-range keys
 * are unbounded, so they cannot be enumerated from PERIODS.
 */
export function clearRetailCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith(`${CACHE_KEY}:`) || key === CACHE_KEY)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function toResult(cache: RetailCache, fromCache: boolean): RetailLoadResult {
  return { summary: cache.summary, syncedAt: cache.syncedAt, fromCache };
}

/** Cached data for instant display (null on first visit). Never throws. */
export function loadRetailCached(employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): RetailLoadResult | null {
  const cache = readCache(employeeId, selection);
  return cache ? toResult(cache, true) : null;
}

/**
 * Fresh fetch from the Hub proxy. Retries once after ~1s on failure
 * (fetchProxyJson — never on 401). Throws on any failure (including
 * 401 — the caller's token is missing or expired; AuthContext's
 * expiry checker signs the session out separately).
 */
export async function loadRetailFresh(token: string, employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): Promise<RetailLoadResult> {
  const summary: unknown = await fetchProxyJson(
    `/api/retail-data?${selectionQuery(selection)}`,
    token,
    FETCH_TIMEOUT_MS,
    'retail-data',
  );
  if (!isValidSummary(summary)) throw new Error('retail-data: unexpected response shape');
  const cache: RetailCache = { summary: normalizeSummary(summary), employeeId, syncedAt: Date.now() };
  writeCache(cache, selection);
  return toResult(cache, false);
}
