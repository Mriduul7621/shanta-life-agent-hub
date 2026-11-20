/**
 * Due-premium widget (Milestone 3, live mode in Phase 2) — Home.
 *
 * Two modes:
 *
 * DEMO ROWS (no `live` prop): lists the next dues (customer, policy,
 * due date, amount) from demoData.ts (fictional customers and DEMO-
 * policy numbers), grouped into "Due this week" and "Overdue"
 * following the verified Retail Dashboard rule (M3_DESIGN.md §2.4).
 * Carries a DEMO DATA badge and says so plainly.
 *
 * LIVE SUMMARY (`live` prop): the real due summary from the retail
 * proxy — count + amount for the month to date, scoped to the caller
 * — plus the 3 most recent dues (nearest due date first) above the
 * totals. Each row carries ONLY the owner name, the due date and the
 * premium (no policy number, no mobile — the payload has no mobile
 * field anywhere); overdue rows are marked Overdue. The full due
 * list lives in the Retail Sales Dashboard (linked). When the
 * summary comes from the demo fixture (demo users on the preview),
 * it is labelled DEMO like everywhere else. An older proxy response
 * has no `dueRows` — the widget then shows only the totals.
 */
import { useI18n } from '../i18n/I18nContext';
import type { Lang } from '../i18n/dictionary';
import { formatBdt } from '../data/demoData';
import type { DueRow, WidgetData } from '../data/demoData';
import { MODULES } from '../data/modules';
import type { RetailDueRow, RetailScope } from '../data/retailData';

const MAX_DUE_ROWS = 5;
const MAX_OVERDUE_ROWS = 5;
const WINDOW_DAYS = 7;

export interface DueLiveSummary {
  duePolicies: number;
  duePremium: number;
  /** 'YYYY-MM' — the month the Due Premium figure covers. */
  dueMonth: string;
  scope: RetailScope;
  /** True when the summary comes from the synthetic demo slice. */
  demo: boolean;
  /** The 3 most recent dues (nearest due date first). Absent from
   *  older proxy responses — the widget then shows only the totals. */
  dueRows?: RetailDueRow[];
}

const SCOPE_KEY = {
  own: 'dashboardScopeOwn',
  team: 'dashboardScopeTeam',
  subtree: 'dashboardScopeSubtree',
  org: 'dashboardScopeOrg',
} as const;

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

/** 'YYYY-MM' → 'November 2026' (locale-aware). */
function formatMonth(ym: string, lang: Lang): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

function LiveSummary({ live }: { live: DueLiveSummary }) {
  const { t, lang } = useI18n();
  const retailUrl = MODULES.find((m) => m.id === 'retail-dashboard')?.url;
  const rows = live.dueRows ?? [];
  // The month totals are month-to-date; the rows are the 3 most
  // recent dues regardless of window, so rows can exist while the
  // MTD totals are 0 (all dues later this month, or all overdue).
  const empty = live.duePolicies === 0 && live.duePremium === 0 && rows.length === 0;
  const today = localIso(new Date());
  return (
    <section
      aria-label={t('dueWidgetTitle')}
      className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-charcoal">{t('dueWidgetTitle')}</h3>
        {live.demo ? (
          <span className="rounded-full bg-sunset/15 px-2.5 py-1 text-xs font-bold text-sunset-dark">
            {t('dashboardDemoBadge')}
          </span>
        ) : (
          <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
            {t('dashboardLiveFrom')}
          </span>
        )}
        <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
          {t(SCOPE_KEY[live.scope])}
        </span>
      </div>
      <p className="mt-1 text-sm text-charcoal/60">
        {live.demo ? t('dashboardDemoNote') : t('dueWidgetLiveNote')}
      </p>

      {empty ? (
        <p className="mt-3 text-base font-medium text-charcoal/70">{t('widgetDuesMonthEmpty')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-charcoal/55">
                {t('dueWidgetRecentTitle')}
              </h4>
              <ul className="divide-y divide-cream-dark">
                {rows.map((row) => (
                  <li
                    key={`${row.nextDue}-${row.owner}-${row.premium}`}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-charcoal">{row.owner}</p>
                      <p className="truncate text-xs text-charcoal/55">
                        {t('dueWidgetDueOn', { date: formatDueDate(row.nextDue) })}
                        {row.nextDue < today && (
                          <>
                            {' · '}
                            <span className="font-semibold text-sunset-dark">
                              {t('dueWidgetOverdue')}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-charcoal">
                      {formatBdt(row.premium)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-3xl font-bold tracking-tight text-charcoal">{formatBdt(live.duePremium)}</p>
            <p className="mt-1 text-sm text-charcoal/60">
              {t('dueWidgetPoliciesDue', { count: live.duePolicies })} ·{' '}
              {t('dueWidgetMonthLabel', { month: formatMonth(live.dueMonth, lang) })}
            </p>
            {retailUrl && (
              <a
                href={retailUrl}
                className="mt-3 inline-block text-sm font-semibold text-sunset-dark underline-offset-2 hover:underline"
              >
                {t('dashboardOpenFull')} →
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function DuePremiumsWidget({ data, live }: { data?: WidgetData; live?: DueLiveSummary }) {
  const { t } = useI18n();

  if (live) return <LiveSummary live={live} />;
  if (!data) return null;

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
