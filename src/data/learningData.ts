/**
 * Learning Hub summary fetch (browser side) — Phase 2.
 *
 * The Home widgets and the Learning page do NOT touch the Learning
 * Hub's Supabase directly. They call the Hub-side proxy same-origin
 * (`/api/learning-data`, see api/learning-data.js) with the Hub JWT;
 * the proxy verifies the token, queries the Learning Hub READ-ONLY
 * with the service_role key, and returns ONLY the computed summary
 * for the caller's visible slice. The browser never receives raw
 * learner rows — the caller's own progress plus their direct reports'
 * names and progress, nothing more.
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

export type LearningScope = 'own' | 'team' | 'subtree' | 'org';

export interface LearningCurrentCourse {
  courseId: string;
  title: string;
  percent: number;
  modulesDone: number;
  modulesTotal: number;
}

export interface LearningTeamMember {
  employeeId: string;
  name: string;
  designation: string;
  overallPercent: number;
  modulesCompleted: number;
  modulesTotal: number;
  credit: number;
  lastActivity: string | null;
}

export interface LearningSummary {
  scope: LearningScope;
  role: string;
  /** The period this summary was computed for ('all' = no filtering). */
  period: Period;
  /** { start, end } ISO dates of the period window, null for 'all'. */
  periodWindow: { start: string; end: string } | null;
  userEmployeeId: string;
  userName: string | null;
  /** True when the visible scope holds no data at all. */
  empty: boolean;
  /** 'no-lms-record': no (active) Learning Hub employee record for this Employee ID. 'no-rows': record exists, but no learning yet. */
  emptyReason: 'no-lms-record' | 'no-rows' | null;
  learning: {
    currentCourse: LearningCurrentCourse | null;
    coursesEnrolled: number;
    coursesCompleted: number;
    certificates: number;
    creditBalance: number;
    /** Enrolments in the period (enrolled_at); == coursesEnrolled for 'all'. */
    enrolledInPeriod: number;
    /** Completions in the period; == coursesCompleted for 'all'. */
    completedInPeriod: number;
    /** Net credits earned in the period; == creditBalance for 'all'. */
    creditsInPeriod: number;
    /** Courses currently in progress (count). Absent from older proxy
     *  responses — Home reads it defensively (?? 0). */
    coursesInProgress?: number;
  };
  team: {
    /** Subtree (downline) count. */
    teamSize: number;
    directCount: number;
    /** Mean of direct reports' overall %. */
    avgProgress: number;
    /** Direct reports with at least one in-progress course. */
    learningMembersCount: number;
    members: LearningTeamMember[];
  } | null;
  /** True when a row fetch hit its cap (aggregates may be partial). */
  truncated: boolean;
  /** Epoch ms of the fetch. */
  syncedAt: number;
}

export interface LearningLoadResult {
  summary: LearningSummary;
  /** Epoch ms of the successful fetch (or of the cached fetch). */
  syncedAt: number;
  fromCache: boolean;
}

const CACHE_KEY = 'hub-learning-cache-v1';
const FETCH_TIMEOUT_MS = 30_000;

interface LearningCache {
  summary: LearningSummary;
  employeeId: string;
  syncedAt: number;
}

function isValidSummary(value: unknown): value is LearningSummary {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.scope === 'string' &&
    typeof s.empty === 'boolean' &&
    typeof s.learning === 'object' &&
    s.learning !== null &&
    typeof (s.learning as Record<string, unknown>).coursesEnrolled === 'number' &&
    typeof (s.learning as Record<string, unknown>).creditBalance === 'number' &&
    (s.team === null || typeof s.team === 'object')
  );
}

function cacheKey(selection: PeriodSelection): string {
  return `${CACHE_KEY}:${selectionCacheSuffix(selection)}`;
}

function readCache(employeeId: string, selection: PeriodSelection): LearningCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(selection));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LearningCache;
    if (parsed.employeeId !== employeeId) return null;
    if (typeof parsed.syncedAt !== 'number' || !isValidSummary(parsed.summary)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: LearningCache, selection: PeriodSelection): void {
  try {
    sessionStorage.setItem(cacheKey(selection), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the page still works, just without a cache.
  }
}

/**
 * Clear the cached Learning summaries for ALL periods (sign-out, user
 * switch). Never throws. Iterates by key prefix — custom-range keys
 * are unbounded, so they cannot be enumerated from PERIODS.
 */
export function clearLearningCache(): void {
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

function toResult(cache: LearningCache, fromCache: boolean): LearningLoadResult {
  return { summary: cache.summary, syncedAt: cache.syncedAt, fromCache };
}

/** Cached data for instant display (null on first visit). Never throws. */
export function loadLearningCached(employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): LearningLoadResult | null {
  const cache = readCache(employeeId, selection);
  return cache ? toResult(cache, true) : null;
}

/**
 * Fresh fetch from the Hub proxy. Retries once after ~1s on failure
 * (fetchProxyJson — never on 401). Throws on any failure (including
 * 401 — the caller's token is missing or expired; AuthContext's
 * expiry checker signs the session out separately).
 */
export async function loadLearningFresh(token: string, employeeId: string, selection: PeriodSelection = DEFAULT_SELECTION): Promise<LearningLoadResult> {
  const summary: unknown = await fetchProxyJson(
    `/api/learning-data?${selectionQuery(selection)}`,
    token,
    FETCH_TIMEOUT_MS,
    'learning-data',
  );
  if (!isValidSummary(summary)) throw new Error('learning-data: unexpected response shape');
  const cache: LearningCache = { summary, employeeId, syncedAt: Date.now() };
  writeCache(cache, selection);
  return toResult(cache, false);
}
