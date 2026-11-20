import { useEffect, useState } from 'react';
import {
  PERIODS,
  DEFAULT_SELECTION,
  addDaysIsoLocal,
  dhakaTodayLocal,
  isValidCustomRange,
  periodLabelKey,
  type Period,
  type PeriodSelection,
} from '../data/period';
import { useI18n } from '../i18n/I18nContext';

/**
 * Time-frame dropdown, shared by the Dashboard, Leads and Learning
 * pages. Each page keeps its own selection in session state and
 * passes it in; the selector is purely presentational.
 *
 * A styled native <select> (keyboard accessible, works at 360px):
 * Today / This month / Last 3 months / Last 6 months / This year /
 * All time / Custom. Choosing Custom reveals start/end date inputs
 * (native date inputs, Dhaka dates) prefilled with the last 7 days;
 * the selection fires only for a valid pair (from <= to, to <=
 * today, range <= 2 years) — an invalid pair shows an inline error
 * and the page keeps its last summary.
 */
interface PeriodSelectorProps {
  value: PeriodSelection;
  onChange: (selection: PeriodSelection) => void;
  /** Accessible label for the control (dictionary key 'periodLabel'). */
  label?: string;
}

export default function PeriodSelector({ value, onChange, label }: PeriodSelectorProps) {
  const { t } = useI18n();
  const today = dhakaTodayLocal();
  const minDate = addDaysIsoLocal(today, -730);
  // Draft custom range: seeded from the current selection, or the
  // last 7 days when Custom is picked fresh.
  const [from, setFrom] = useState(value.from ?? addDaysIsoLocal(today, -7));
  const [to, setTo] = useState(value.to ?? today);
  const [invalid, setInvalid] = useState(false);

  // Keep the draft in sync when the parent selection changes
  // (e.g. another control reset it).
  useEffect(() => {
    if (value.period === 'custom' && value.from && value.to) {
      setFrom(value.from);
      setTo(value.to);
      setInvalid(false);
    }
  }, [value.period, value.from, value.to]);

  function handlePeriodChange(period: Period) {
    if (period === 'custom') {
      const nextFrom = value.from ?? addDaysIsoLocal(today, -7);
      const nextTo = value.to ?? today;
      setFrom(nextFrom);
      setTo(nextTo);
      setInvalid(!isValidCustomRange(nextFrom, nextTo, today));
      onChange({ period: 'custom', from: nextFrom, to: nextTo });
      return;
    }
    setInvalid(false);
    onChange({ period });
  }

  function handleDateChange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!nextFrom || !nextTo) {
      setInvalid(true);
      return;
    }
    if (!isValidCustomRange(nextFrom, nextTo, today)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange({ period: 'custom', from: nextFrom, to: nextTo });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="period-select"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {label ?? t('periodLabel')}
        </label>
        <select
          id="period-select"
          value={value.period}
          onChange={(e) => handlePeriodChange(e.target.value as Period)}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-charcoal shadow-sm outline-none focus:border-sunset focus:ring-2 focus:ring-sunset/30 sm:w-auto sm:min-w-44"
        >
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              {t(periodLabelKey(period))}
            </option>
          ))}
        </select>
      </div>
      {value.period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="period-custom-from"
              className="mb-1 block text-xs font-semibold text-charcoal/70"
            >
              {t('periodCustomFrom')}
            </label>
            <input
              id="period-custom-from"
              type="date"
              value={from}
              min={minDate}
              max={today}
              onChange={(e) => handleDateChange(e.target.value, to)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-charcoal shadow-sm outline-none focus:border-sunset focus:ring-2 focus:ring-sunset/30"
            />
          </div>
          <div>
            <label
              htmlFor="period-custom-to"
              className="mb-1 block text-xs font-semibold text-charcoal/70"
            >
              {t('periodCustomTo')}
            </label>
            <input
              id="period-custom-to"
              type="date"
              value={to}
              min={minDate}
              max={today}
              onChange={(e) => handleDateChange(from, e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-charcoal shadow-sm outline-none focus:border-sunset focus:ring-2 focus:ring-sunset/30"
            />
          </div>
          {invalid && (
            <p role="alert" className="w-full text-sm font-medium text-red-700">
              {t('periodCustomInvalid')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { DEFAULT_SELECTION };
export type { Period, PeriodSelection };
