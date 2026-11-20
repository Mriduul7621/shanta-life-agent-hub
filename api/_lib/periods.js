/**
 * Shared time-frame periods for the Hub's three data feeds
 * (retail / LeadFlow / Learning Hub). PURE module (no Node/browser
 * APIs except Date) — imported by the proxies, the summarizers, and
 * the Node QA scripts, so the window rule is defined exactly once.
 *
 * Periods: Today / This month / Last 3 months / Last 6 months /
 * This year / All time / Custom. DEFAULT = 'today' (Mahadi
 * 2026-11-20 — the data pages open on today's figures). The 3m / 6m
 * windows are ROLLING (today minus 3/6 calendar months, same
 * convention as the retail Active-FA window), not calendar months.
 *
 * NOTE the split: the PROXY + CLIENT default is 'today'
 * (DEFAULT_PERIOD here, DEFAULT_SELECTION in src/data/period.ts),
 * but the summarizer function defaults stay 'all'
 * (buildRetailIndex / summarizeRetail / summarizeLeadflow /
 * summarizeLearning take period = 'all') — a summarizer called
 * without a period keeps returning unfiltered numbers, which is
 * what the Home snapshots and the QA fixture expectations rely on.
 * Only the query/client default changed.
 *
 * Two window shapes, one rule:
 * - Date windows (retail PR rows carry ISO date strings): [start,
 *   today] INCLUSIVE on both ends.
 * - Instant windows (LeadFlow / Learning timestamps): [startMs,
 *   endMs) HALF-OPEN — startMs is 00:00 Dhaka on the start date,
 *   endMs is 00:00 Dhaka on the day after the END date. An event
 *   exactly at 00:00 Dhaka on the start date counts; one exactly at
 *   00:00 Dhaka the day after the end date does not. Same boundary
 *   as the date window. (For the named periods the end date IS
 *   today, so endMs is 00:00 Dhaka tomorrow; for a custom range it
 *   is 00:00 Dhaka the day after the range end.)
 *
 * Custom ranges: `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * Validated by parseCustomRange — both dates real, from <= to,
 * to <= today, range <= 2 years (730 days). Anything else is a 400
 * (parsePeriodQuery returns null) — never a silent fallback.
 *
 * Self-contained except dhakaDayBounds (api/_lib/supabase.js, which
 * imports nothing): the month arithmetic is duplicated from
 * retailSummary.js on purpose — importing retailSummary here would
 * create a cycle (retailSummary imports this module for its windows).
 */
import { dhakaDayBounds } from './supabase.js';

/** Add `months` calendar months to an ISO date (clamps the day). */
function addMonthsIso(value, months) {
  const [y, m, d] = value.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export const PERIODS = ['today', 'this-month', '3m', '6m', 'this-year', 'all', 'custom'];

/** The default period (no ?period= param) — today's figures. */
export const DEFAULT_PERIOD = 'today';

/** Maximum custom range, in days (2 years, inclusive). */
export const MAX_CUSTOM_RANGE_DAYS = 730;

export function isValidPeriod(value) {
  return typeof value === 'string' && PERIODS.includes(value);
}

/**
 * Validate a ?period= query value. Returns the period, 'today' when
 * the param is absent, or null when it is present but invalid (the
 * proxy answers 400 — never silently fall back for a misspelled
 * period, or a caller would read the wrong window).
 */
export function parsePeriodParam(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_PERIOD;
  return isValidPeriod(value) ? value : null;
}

/** Strict YYYY-MM-DD check: format + a real calendar date (UTC round-trip). */
function isRealIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function daysBetween(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / msPerDay);
}

/**
 * Validate a custom ?from= / ?to= pair against today's Dhaka date.
 * Returns { start, end } or null when anything is wrong: missing or
 * malformed dates, from after to, to in the future, or a range over
 * 2 years. The caller answers 400 on null.
 */
export function parseCustomRange(from, to, todayIso) {
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) return null;
  if (from > to) return null;
  if (to > todayIso) return null;
  if (daysBetween(from, to) > MAX_CUSTOM_RANGE_DAYS) return null;
  return { start: from, end: to };
}

/**
 * Validate a whole period query (?period= + ?from= / ?to=).
 * Returns { period, customRange } — customRange is { start, end }
 * for 'custom' and null otherwise — or null when the query is
 * invalid (bad period, or 'custom' without a valid range). `from` /
 * `to` with a NAMED period are ignored (the named window wins).
 */
export function parsePeriodQuery(searchParams, todayIso) {
  const period = parsePeriodParam(searchParams.get('period'));
  if (period === null) return null;
  if (period === 'custom') {
    const customRange = parseCustomRange(
      searchParams.get('from'),
      searchParams.get('to'),
      todayIso,
    );
    if (customRange === null) return null;
    return { period, customRange };
  }
  return { period, customRange: null };
}

/**
 * The date window for a period: { start, end } ISO dates, inclusive.
 * Returns null for 'all' (no filtering). For 'custom' the validated
 * range must be passed — a missing range returns null (the proxies
 * validate first, so this is a programming error, not a fallback).
 */
export function periodDateWindow(period, todayIso, customRange = null) {
  const today = todayIso;
  switch (period) {
    case 'today':
      return { start: today, end: today };
    case 'this-month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case '3m':
      return { start: addMonthsIso(today, -3), end: today };
    case '6m':
      return { start: addMonthsIso(today, -6), end: today };
    case 'this-year':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    case 'custom':
      return customRange ? { start: customRange.start, end: customRange.end } : null;
    case 'all':
    default:
      return null;
  }
}

/**
 * The instant window for a period: { startMs, endMs } UTC epoch ms,
 * half-open [startMs, endMs). Returns null for 'all' (no filtering).
 * endMs is 00:00 Dhaka on the day AFTER the window's end date — for
 * the named periods that is tomorrow; for a custom range it is the
 * day after the range end.
 */
export function periodMsWindow(period, todayIso, customRange = null) {
  const dates = periodDateWindow(period, todayIso, customRange);
  if (!dates) return null;
  return {
    startMs: dhakaDayBounds(dates.start).startMs,
    endMs: dhakaDayBounds(dates.end).endMs,
  };
}
