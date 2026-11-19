/**
 * Due-premium widget (Milestone 3) — Home.
 *
 * Lists the next dues (customer, policy, due date, amount), grouped into
 * "Due this week" and "Overdue" following the verified Retail Dashboard
 * rule (M3_DESIGN.md §2.4): Inforce + next due inside the window = due;
 * backlog outstanding + next due before the window = overdue.
 *
 * DEMO DATA: the rows come from demoData.ts (fictional customers and
 * DEMO- policy numbers) because the Due & Lapse sheet needs a
 * service-account secret the Hub must not hold. The widget carries a DEMO
 * DATA badge and says so plainly. The row shape mirrors the verified
 * mapping, so the real feed can drop in later without a UI change.
 */
import { useI18n } from '../i18n/I18nContext';
import { formatBdt } from '../data/demoData';
import type { DueRow, WidgetData } from '../data/demoData';

const MAX_DUE_ROWS = 5;
const MAX_OVERDUE_ROWS = 5;
const WINDOW_DAYS = 7;

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIso(d);
}

function formatDueDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DueList({ rows, overdue }: { rows: DueRow[]; overdue: boolean }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <ul className="divide-y divide-cream-dark">
      {rows.map((row) => (
        <li key={row.policy} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-charcoal">{row.owner}</p>
            <p className="truncate text-xs text-charcoal/55">
              {row.policy} · {t('dueWidgetDueOn', { date: formatDueDate(row.nextDue) })}
            </p>
            {overdue && row.duePrem > 0 && (
              <p className="text-xs font-semibold text-sunset-dark">
                {t('dueWidgetBacklog', { amount: formatBdt(row.duePrem) })}
              </p>
            )}
          </div>
          <p className="shrink-0 text-sm font-bold tabular-nums text-charcoal">{formatBdt(row.premium)}</p>
        </li>
      ))}
    </ul>
  );
}

export function DuePremiumsWidget({ data }: { data: WidgetData }) {
  const { t } = useI18n();
  const today = localIso(new Date());
  const windowEnd = addDays(today, WINDOW_DAYS);

  const byDate = (a: DueRow, b: DueRow) => a.nextDue.localeCompare(b.nextDue);
  const due = data.dueRows
    .filter((r) => r.status === 'Inforce' && r.nextDue >= today && r.nextDue <= windowEnd)
    .sort(byDate);
  const overdue = data.dueRows
    .filter((r) => r.status === 'Inforce' && r.nextDue < today)
    .sort(byDate);

  const shownDue = due.slice(0, MAX_DUE_ROWS);
  const shownOverdue = overdue.slice(0, MAX_OVERDUE_ROWS);
  const empty = shownDue.length === 0 && shownOverdue.length === 0;

  return (
    <section
      aria-label={t('dueWidgetTitle')}
      className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-charcoal">{t('dueWidgetTitle')}</h3>
        <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
          {t('demoDataBadge')}
        </span>
      </div>
      <p className="mt-1 text-sm text-charcoal/60">{t('dueWidgetDemoNote')}</p>

      {empty ? (
        <p className="mt-3 text-base font-medium text-charcoal/70">{t('widgetDuesEmpty')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {shownDue.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-charcoal/55">
                {t('dueWidgetDueThisWeek')}
              </h4>
              <DueList rows={shownDue} overdue={false} />
              {data.dues > shownDue.length && (
                <p className="mt-2 text-xs text-charcoal/55">
                  {t('dueWidgetShowing', { shown: shownDue.length, total: data.dues })}
                </p>
              )}
            </div>
          )}
          {shownOverdue.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-sunset-dark">
                {t('dueWidgetOverdue')}
              </h4>
              <DueList rows={shownOverdue} overdue />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
