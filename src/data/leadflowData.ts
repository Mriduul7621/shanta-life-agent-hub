/**
 * LeadFlow summary fetch (browser side) — Phase 2.
 *
 * The Home widgets and the Leads page do NOT touch LeadFlow's Supabase
 * directly. They call the Hub-side proxy same-origin
 * (`/api/leadflow-data`, see api/leadflow-data.js) with the Hub JWT;
 * the proxy verifies the token, queries LeadFlow READ-ONLY with the
 * service_role key, and returns ONLY the computed summary for the
 * caller's visible slice. The browser never receives raw lead rows or
 * customer PII — counts and aggregates only.
 *
 * Caching: same pattern as retailData.ts — the summary is kept in
 * sessionStorage for this browser session (stale-while-revalidate).
 * NOTHING is persisted across sessions. The cache is bound to the
 * signed-in Employee ID: a cached summary for another user is
 * ignored, and sign-out clears it (see AuthContext) — scoped data
 * must never leak across users on a shared device. The cache key
 * also includes the time-frame period.
 */
import {
  DEFAULT_SELECTION,
  selectionCacheSuffix,
  selectionQuery,
  type Period,
  type PeriodSelection,
} from './period';
import { fetchProxyJson } from './fetchWithRetry';

export type LeadflowScope = 'own' | 'team' | 'subtree' | 'org';

export interface LeadflowTeamMember {
  employeeId: string;
  name: string;
  followupsToday: number;
  followupsOverdue: number;
  openLeads: number;
}

export interface LeadflowSummary {
  scope: LeadflowScope;
  role: string;
  /** The period this summary was computed for ('all' = no filtering). */
  period: Period;
  /** { start, end } ISO dates of the period window, null for 'all'. */
  periodWindow: { start: string; end: string } | null;
  userEmployeeId: string;
  userName: string | null;
  /** True when the visible scope holds no data at all. */
  empty: boolean;
  /** 'no-leadflow-account': no LeadFlow row for this Employee ID. 'no-rows': account exists, but no leads yet. */
  emptyReason: 'no-leadflow-account' | 'no-rows' | null;
  followups: { overdue: number; today: number; upcoming: number; all: number };
  leads: {
    total: number;
    open: number;
    converted: number;
    todayCollection: number;
    /** Leads created inside the period (created_at); == total for 'all'. */
    createdInPeriod: number;
    statusCounts: Record<string, number>;
  };
  team: {
    teamSize: number;
    followups: { overdue: number; today: number; upcoming: number; all: number };
    leads: { total: number; open: number; converted: number; createdInPeriod: number };
    members: LeadflowTeamMember[];
  } | null;
  /** True when the terminal-status dictionary was unavailable and the proxy fell back to Converted + Not Interested. */
  terminalFallback: boolean;
  /** True when the row fetch hit its cap (status counts / member table may be partial — headline counts are exact). */
  truncated: boolean;
  /** Epoch ms of the fetch. */
  syncedAt: number;
}

export interface LeadflowLoadResult {
  summary: LeadflowSummary;
  /** Epoch ms of the successful fetch (or of the cached fetch). */
  syncedAt: number;
  fromCache: boolean;
}

const CACHE_KEY = 'hub-leadflow-cache-v1';
const FETCH_TIMEOUT_MS = 30_000;

interface LeadflowCache {
  summary: LeadflowSummary;
  employeeId: string;
  syncedAt: number;
}

function isValidSummary(value: unknown): value is LeadflowSummary {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.scope === 'string' &&
    typeof s.empty === 'boolean' &&
    typeof s.followups === 'object' &&
    s.followups !== null &&
    typeof (s.followups as Record<string, unknown>).today === 'number' &&
    typeof s.leads === 'object' &&
    s.leads !== null &&
    typeof (s.leads as Record<string, unknown>).total === 'number' &&
    (s.team === null || typeof s.team === 'object')
  );
}

function cacheKey(selection: PeriodSelection): string {
  return `${CACHE_KEY}:${selectionCacheSuffix(selection)}`;
}

function readCache(employeeId: string, selection: PeriodSelection): LeadflowCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(selection));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeadflowCache;
    if (parsed.employeeId !== employeeId) return null;
    if (typeof parsed.syncedAt !== 'number' || !isValidSummary(parsed.summary)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: LeadflowCache, selection: PeriodSelection): void {
  try {
    sessionStorage.setItem(cacheKey(selection), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the page still works, just without a cache.
  }
}

/**
 * Clear the cached Leads summaries for ALL periods (sign-out, user
 * switch). Never throws. Iterates by key prefix — custom-range keys
 * are unbounded, so they cannot be enumerated from PERIODS.
 */
export function clearLeadflowCache(): void {
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

function toResult(cache: LeadflowCache, fromCache: boolean): LeadflowLoadResult {
  return { summary: cache.summary, syncedAt: cache.syncedAt, fromCache };
}

/** Cached data for instant display (null on first visit). Never throws. */
export function loadLeadflowCached(employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): LeadflowLoadResult | null {
  const cache = readCache(employeeId, selection);
  return cache ? toResult(cache, true) : null;
}

/**
 * Fresh fetch from the Hub proxy. Retries once after ~1s on failure
 * (fetchProxyJson — never on 401). Throws on any failure (including
 * 401 — the caller's token is missing or expired; AuthContext's
 * expiry checker signs the session out separately).
 */
export async function loadLeadflowFresh(token: string, employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): Promise<LeadflowLoadResult> {
  const summary: unknown = await fetchProxyJson(
    `/api/leadflow-data?${selectionQuery(selection)}`,
    token,
    FETCH_TIMEOUT_MS,
    'leadflow-data',
  );
  if (!isValidSummary(summary)) throw new Error('leadflow-data: unexpected response shape');
  const cache: LeadflowCache = { summary, employeeId, syncedAt: Date.now() };
  writeCache(cache, selection);
  return toResult(cache, false);
}
