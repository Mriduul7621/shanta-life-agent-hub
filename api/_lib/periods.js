/**
 * Shared time-frame periods for the Hub's three data feeds
 * (retail / LeadFlow / Learning Hub). PURE module (no Node/browser
 * APIs except Date) — imported by the proxies, the summarizers, and
 * the Node QA scripts, so the window rule is defined exactly once.
 *
 * Periods: This month / Last 3 months / Last 6 months / This year /
 * All time. Default = 'all' (preserves the numbers the pages show
 * today). The 3m / 6m windows are ROLLING (today minus 3/6 calendar
 * months, same convention as the retail Active-FA window), not
 * calendar months.
 *
 * Two window shapes, one rule:
 * - Date windows (retail PR rows carry ISO date strings): [start,
 *   today] INCLUSIVE on both ends.
 * - Instant windows (LeadFlow / Learning timestamps): [startMs,
 *   endMs) HALF-OPEN — startMs is 00:00 Dhaka on the start date,
 *   endMs is 00:00 Dhaka on the day after today. An event exactly
 *   at 00:00 Dhaka on the start date counts; one exactly at 00:00
 *   Dhaka tomorrow does not. Same boundary as the date window.
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

export const PERIODS = ['this-month', '3m', '6m', 'this-year', 'all'];

/** The default period (no ?period= param) — all-time, as today. */
export const DEFAULT_PERIOD = 'all';

export function isValidPeriod(value) {
  return typeof value === 'string' && PERIODS.includes(value);
}

/**
 * Validate a ?period= query value. Returns the period, 'all' when
 * the param is absent, or null when it is present but invalid (the
 * proxy answers 400 — never silently fall back to 'all' for a
 * misspelled period, or a caller would read the wrong window).
 */
export function parsePeriodParam(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_PERIOD;
  return isValidPeriod(value) ? value : null;
}

/**
 * The date window for a period: { start, end } ISO dates, inclusive.
 * Returns null for 'all' (no filtering).
 */
export function periodDateWindow(period, todayIso) {
  const today = todayIso;
  switch (period) {
    case 'this-month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case '3m':
      return { start: addMonthsIso(today, -3), end: today };
    case '6m':
      return { start: addMonthsIso(today, -6), end: today };
    case 'this-year':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    case 'all':
    default:
      return null;
  }
}

/**
 * The instant window for a period: { startMs, endMs } UTC epoch ms,
 * half-open [startMs, endMs). Returns null for 'all' (no filtering).
 */
export function periodMsWindow(period, todayIso) {
  const dates = periodDateWindow(period, todayIso);
  if (!dates) return null;
  return {
    startMs: dhakaDayBounds(dates.start).startMs,
    endMs: dhakaDayBounds(todayIso).endMs,
  };
}
