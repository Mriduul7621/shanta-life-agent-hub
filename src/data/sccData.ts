/**
 * Sales Command Center live fetch (Milestone 3) — browser side.
 *
 * Fetches the SCC's own Google Sheet as public gviz CSV (the same URLs the
 * SCC app itself fetches in production — see sccParse.ts for the source
 * verification). No secrets, no credentials: the sheet is link-shared and
 * the gviz endpoint answers with CORS headers for https origins.
 *
 * Caching: the raw CSVs are kept in sessionStorage for the browser session
 * (stale-while-revalidate — the Dashboard shows cached data immediately and
 * refreshes in the background). Nothing is persisted across sessions.
 */
import { summarize } from './sccParse';
import type { SccSummary } from './sccParse';

/** Public sheet ID — copied from the SCC's public repo (DEFAULT_SHEET_URL). Not a secret. */
export const SCC_SHEET_ID = '1u_EVyLhcUwiqEJgY1sO2-iN8GdsUW_tOB5_csNrrUco';
const PRODUCER_TAB = 'Producer info';
const SESSION_TAB = 'Training Data';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_KEY = 'hub-scc-cache-v1';

export interface SccLoadResult {
  summary: SccSummary;
  /** Epoch ms of the successful fetch (or of the cached fetch). */
  syncedAt: number;
  fromCache: boolean;
}

interface SccCache {
  producerCsv: string;
  sessionCsv: string | null;
  syncedAt: number;
}

function gvizUrl(tab: string): string {
  return `https://docs.google.com/spreadsheets/d/${SCC_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

async function fetchTab(tab: string): Promise<string> {
  const res = await fetch(gvizUrl(tab), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`gviz ${tab}: HTTP ${res.status}`);
  return res.text();
}

function readCache(): SccCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SccCache;
    if (typeof parsed.producerCsv !== 'string' || typeof parsed.syncedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: SccCache): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the page still works, just without a cache.
  }
}

function toResult(cache: SccCache, fromCache: boolean): SccLoadResult {
  return { summary: summarize(cache.producerCsv, cache.sessionCsv), syncedAt: cache.syncedAt, fromCache };
}

/** Cached data for instant display (null on first visit). Never throws. */
export function loadSccCached(): SccLoadResult | null {
  const cache = readCache();
  return cache ? toResult(cache, true) : null;
}

/**
 * Fresh fetch of both tabs. The Producer tab failing is fatal (its data
 * drives every KPI); the Training Data tab failing is tolerated, exactly as
 * the SCC tolerates it — session KPIs then render as unavailable.
 */
export async function loadSccFresh(): Promise<SccLoadResult> {
  const producerCsv = await fetchTab(PRODUCER_TAB);
  let sessionCsv: string | null;
  try {
    sessionCsv = await fetchTab(SESSION_TAB);
  } catch {
    sessionCsv = null;
  }
  const cache: SccCache = { producerCsv, sessionCsv, syncedAt: Date.now() };
  writeCache(cache);
  return toResult(cache, false);
}
