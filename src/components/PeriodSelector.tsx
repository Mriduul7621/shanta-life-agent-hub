import { PERIODS, DEFAULT_PERIOD, periodLabelKey, type Period } from '../data/period';
import { useI18n } from '../i18n/I18nContext';

/**
 * Time-frame pill group, shared by the Dashboard, Leads and Learning
 * pages. Each page keeps its own period in session state and passes
 * it in; the selector is purely presentational.
 *
 * Layout: flex-wrap so all five pills fit at 360px without overflow
 * (long Bangla labels wrap to a second row rather than clipping).
 */
interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  /** Accessible label for the group (dictionary key 'periodLabel'). */
  label?: string;
}

export default function PeriodSelector({ value, onChange, label }: PeriodSelectorProps) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={label ?? t('periodLabel')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t('periodLabel')}
      </span>
      {PERIODS.map((period) => {
        const active = period === value;
        return (
          <button
            key={period}
            type="button"
            aria-pressed={active}
            data-period={period}
            onClick={() => onChange(period)}
            className={
              active
                ? 'rounded-full bg-sunset px-3 py-1.5 text-xs font-semibold text-white shadow-sm'
                : 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sunset hover:text-sunset-dark'
            }
          >
            {t(periodLabelKey(period))}
          </button>
        );
      })}
    </div>
  );
}

export { DEFAULT_PERIOD };
export type { Period };
