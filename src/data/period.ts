/**
 * Shared time-frame filter for the three data pages (Dashboard, Leads,
 * Learning). Home has no selector: it loads its retail and learning
 * feeds with THIS_MONTH_SELECTION (business, FYCP, policy sales and
 * learning are monthly views, Mahadi 2026-11-20) and its LeadFlow
 * feed with ALL_TIME_SELECTION (follow-ups are day-bucketed, so the
 * period does not change them). Dues and due rows are period-
 * independent snapshots.
 *
 * The values are the exact `?period=` query values the three proxies
 * accept (api/_lib/periods.js) — keep the two in sync. 'today' is the
 * default (Mahadi 2026-11-20): Leads and Learning open on today's
 * figures. The Dashboard page opens on This Month instead (retail
 * data lags a day, so Today shows ৳0). 'custom' carries a from/to
 * date pair; the selection helpers below build the cache key and the
 * query string for it.
 */
import type { DictKey } from '../i18n/dictionary';

export type Period = 'today' | 'this-month' | '3m' | '6m' | 'this-year' | 'all' | 'custom';

export const PERIODS: readonly Period[] = ['today', 'this-month', '3m', '6m', 'this-year', 'all', 'custom'];

export const DEFAULT_PERIOD: Period = 'today';

/** Maximum custom range, in days — mirrors api/_lib/periods.js. */
export const MAX_CUSTOM_RANGE_DAYS = 730;

/**
 * A selected time frame: a named period, or 'custom' with a from/to
 * date pair (YYYY-MM-DD, Dhaka dates). A custom selection without a
 * range is incomplete — pages keep showing their last summary until
 * the user picks a valid pair.
 */
export interface PeriodSelection {
  period: Period;
  from?: string;
  to?: string;
}

export const DEFAULT_SELECTION: PeriodSelection = { period: 'today' };

/** This calendar month — Home's retail and learning feed selection,
 *  and the Dashboard page's default (DASHBOARD_DEFAULT_SELECTION). */
export const THIS_MONTH_SELECTION: PeriodSelection = { period: 'this-month' };

/** The Dashboard page opens on This Month, not Today: retail data
 *  lags a day, so Today shows ৳0 (Mahadi 2026-11-20). Leads and
 *  Learning keep DEFAULT_SELECTION (Today). This is a per-page
 *  override — the shared DEFAULT_SELECTION is unchanged. */
export const DASHBOARD_DEFAULT_SELECTION: PeriodSelection = { period: 'this-month' };

/** All-time, for the feeds that never follow the selector (Home's LeadFlow feed, Leads dues). */
export const ALL_TIME_SELECTION: PeriodSelection = { period: 'all' };

/** Dictionary key for a period's label (see dictionary.ts). */
export function periodLabelKey(period: Period): DictKey {
  switch (period) {
    case 'today':
      return 'periodToday';
    case 'this-month':
      return 'periodThisMonth';
    case '3m':
      return 'periodLast3Months';
    case '6m':
      return 'periodLast6Months';
    case 'this-year':
      return 'periodThisYear';
    case 'all':
      return 'periodAllTime';
    case 'custom':
      return 'periodCustom';
  }
}

/** Today's date in Dhaka (YYYY-MM-DD) — the client-side clock for the selector. */
export function dhakaTodayLocal(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

/** Add `days` calendar days to an ISO date (UTC arithmetic, no DST drift). */
export function addDaysIsoLocal(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Client-side mirror of the server's parseCustomRange rule: both
 * dates real, from <= to, to <= today, range <= 2 years. The
 * selector only fires onChange for a valid pair; the server still
 * re-validates (400 on anything invalid).
 */
export function isValidCustomRange(from: string, to: string, todayIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const real = (v: string): boolean => {
    const [y, m, d] = v.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  if (!real(from) || !real(to)) return false;
  if (from > to) return false;
  if (to > todayIso) return false;
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  return days <= MAX_CUSTOM_RANGE_DAYS;
}

/** True when the selection is complete enough to fetch (custom needs a range). */
export function isCompleteSelection(selection: PeriodSelection): boolean {
  if (selection.period !== 'custom') return true;
  return Boolean(selection.from && selection.to);
}

/** Cache-key suffix for a selection — custom keys carry the range. */
export function selectionCacheSuffix(selection: PeriodSelection): string {
  if (selection.period === 'custom' && selection.from && selection.to) {
    return `custom:${selection.from}:${selection.to}`;
  }
  return selection.period;
}

/** Query string for a selection (no leading '?'). */
export function selectionQuery(selection: PeriodSelection): string {
  if (selection.period === 'custom' && selection.from && selection.to) {
    return `period=custom&from=${selection.from}&to=${selection.to}`;
  }
  return `period=${selection.period}`;
}
