/**
 * Shared time-frame filter for the three data pages (Dashboard, Leads,
 * Learning). Home keeps its snapshot widgets and never uses a period.
 *
 * The values are the exact `?period=` query values the three proxies
 * accept (api/_lib/periods.js) — keep the two in sync. 'all' is the
 * default: it preserves the numbers Mahadi sees today (no filtering).
 */
import type { DictKey } from '../i18n/dictionary';

export type Period = 'this-month' | '3m' | '6m' | 'this-year' | 'all';

export const PERIODS: readonly Period[] = ['this-month', '3m', '6m', 'this-year', 'all'];

export const DEFAULT_PERIOD: Period = 'all';

/** Dictionary key for a period's label (see dictionary.ts). */
export function periodLabelKey(period: Period): DictKey {
  switch (period) {
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
  }
}
