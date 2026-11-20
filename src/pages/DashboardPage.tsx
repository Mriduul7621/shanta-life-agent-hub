/**
 * Dashboard page — the Retail Sales Dashboard summary as the Hub's
 * dashboard view (Mahadi 2026-11-20: the Sales Command Center tile and
 * sheet were the wrong source; retail sales data is authoritative).
 *
 * REAL DATA, ROLE-SCOPED (standing visibility rule, Mahadi 2026-11-20):
 * Employee sees own data only; Team Lead (≥1 subordinate) own + team;
 * Manager own + subtree; Admin/T&D org-wide. Nobody else sees org-wide.
 * The data comes from the Hub-side proxy (`/api/retail-data`), which
 * verifies the Hub JWT and returns ONLY the computed summary for the
 * caller's visible slice — the browser never receives raw rows (the
 * retail payload contains policy-owner PII). See api/retail-data.js and
 * the spec at ~/workspace/agent-hub-retail-spec/RETAIL_DASHBOARD_SPEC.md.
 *
 * The old SCC Training section is gone entirely (FA trained %, training
 * gap, sessions — no retail source exists). If training returns to this
 * page later, it comes from the Learning Hub, not from retail data.
 *
 * Failure behaviour: if the live fetch fails, the page shows an error
 * state with a Retry button and the link to the full Retail Sales
 * Dashboard — never a crash, never a silent substitution of demo numbers
 * for live ones. Cached data (this browser session only, bound to the
 * signed-in Employee ID) shows immediately while a fresh fetch runs in
 * the background; a failed refresh keeps the cached data and says so.
 * Demo accounts (999xxxx) see the synthetic demo slice, labelled DEMO.
 *
 * Time-frame filter: Total Premium / FYCP / Policies and the
 * leaderboard follow the selected period (PR row date); Due Premium
 * stays this calendar month, Persistency stays cumulative, Active FAs
 * stay last-6-months — each labelled as such. Default is All time.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailLoadResult, RetailScope } from '../data/retailData';
import { DEFAULT_PERIOD, periodLabelKey, type Period } from '../data/period';
import PeriodSelector from '../components/PeriodSelector';
import { formatBdt } from '../data/demoData';
import { MODULES } from '../data/modules';
import { WidgetCard } from '../components/WidgetCard';
import { ModuleTile } from '../components/ModuleTile';
import {
  IconCalculator,
  IconCheck,
  IconCoin,
  IconDashboard,
  IconLeads,
  IconProfile,
} from '../components/icons';
import type { DictKey } from '../i18n/dictionary';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; result: RetailLoadResult; refreshFailed: boolean }
  | { status: 'error' };

const fmtCount = (n: number): string => n.toLocaleString('en-IN');

const SCOPE_KEY: Record<RetailScope, DictKey> = {
  own: 'dashboardScopeOwn',
  team: 'dashboardScopeTeam',
  subtree: 'dashboardScopeSubtree',
  org: 'dashboardScopeOrg',
};

function fmtSynced(syncedAt: number): string {
  return new Date(syncedAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DashboardPage() {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const retailModule = MODULES.find((m) => m.id === 'retail-dashboard');
  const employeeId = user?.employeeId ?? '';
  const periodLabel = t(periodLabelKey(period));

  const refresh = useCallback(async () => {
    if (!token || !employeeId) return;
    if (state.status === 'error') setState({ status: 'loading' });
    setRefreshing(true);
    try {
      const result = await loadRetailFresh(token, employeeId, period);
      setState({ status: 'ready', result, refreshFailed: false });
    } catch {
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, refreshFailed: true } : { status: 'error' },
      );
    } finally {
      setRefreshing(false);
    }
  }, [state.status, token, employeeId, period]);

  useEffect(() => {
    if (!token || !employeeId) return;
    let cancelled = false;
    const cached = loadRetailCached(employeeId, period);
    if (cached) {
      setState({ status: 'ready', result: cached, refreshFailed: false });
    } else {
      setState({ status: 'loading' });
    }
    setRefreshing(true);
    loadRetailFresh(token, employeeId, period)
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', result, refreshFailed: false });
      })
      .catch(() => {
        if (cancelled) return;
        if (cached) {
          setState({ status: 'ready', result: cached, refreshFailed: true });
        } else {
          setState({ status: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, employeeId, period]);

  const ready = state.status === 'ready' ? state.result : null;
  const summary = ready?.summary ?? null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t('dashboardPageTitle')}
        </h1>
        <p className="mt-1 text-sm text-charcoal/60">{t('pageDashboardIntro')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summary?.demo ? (
            <span className="rounded-full bg-sunset/15 px-2.5 py-1 text-xs font-bold text-sunset-dark">
              {t('dashboardDemoBadge')}
            </span>
          ) : (
            <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
              {t('dashboardLiveFrom')}
            </span>
          )}
          {summary && (
            <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
              {t(SCOPE_KEY[summary.scope])}
            </span>
          )}
          {ready && (
            <span className="text-xs text-charcoal/55">
              {t('dashboardLastSynced', { time: fmtSynced(ready.syncedAt) })}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="ml-auto min-h-10 rounded-xl border border-cream-dark bg-white px-3.5 text-sm font-semibold text-charcoal shadow-sm transition-colors hover:bg-cream disabled:opacity-50"
          >
            {refreshing ? t('dashboardRefreshing') : t('dashboardRefresh')}
          </button>
        </div>
        <div className="mt-3">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        {summary?.demo && (
          <p className="mt-3 rounded-xl bg-sunset/10 px-4 py-3 text-sm font-medium text-charcoal">
            {t('dashboardDemoNote')}
          </p>
        )}
        {state.status === 'ready' && state.refreshFailed && ready && (
          <p role="status" className="mt-3 rounded-xl bg-sunset/10 px-4 py-3 text-sm font-medium text-charcoal">
            {t('dashboardRefreshFailed', { time: fmtSynced(ready.syncedAt) })}
          </p>
        )}
      </section>

      {state.status === 'loading' && (
        <div aria-busy="true" className="space-y-4">
          <p className="text-sm font-medium text-charcoal/60">{t('dashboardLoading')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                aria-hidden
                className="h-28 animate-pulse rounded-2xl border border-cream-dark bg-white"
              />
            ))}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <section
          aria-label={t('dashboardLoadError')}
          className="rounded-2xl border border-cream-dark bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-bold text-charcoal">{t('dashboardLoadError')}</h2>
          <p className="mt-1 text-sm text-charcoal/60">{t('dashboardLoadErrorDetail')}</p>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="mt-4 min-h-11 rounded-xl bg-charcoal px-5 text-sm font-semibold text-white transition-colors hover:bg-charcoal/90 disabled:opacity-50"
          >
            {refreshing ? t('dashboardRefreshing') : t('dashboardRetry')}
          </button>
        </section>
      )}

      {ready && summary && summary.empty && (
        <section
          aria-label={t('dashboardEmptyTitle')}
          className="rounded-2xl border border-cream-dark bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-bold text-charcoal">{t('dashboardEmptyTitle')}</h2>
          <p className="mt-1 text-sm text-charcoal/60">
            {summary.emptyReason === 'no-code' ? t('dashboardEmptyNoCode') : t('dashboardEmptyNoRows')}
          </p>
        </section>
      )}

      {ready && summary && !summary.empty && (
        <>
          {/* Business KPIs — retail formulas, scoped to the caller */}
          <section aria-label={t('dashboardBusinessTitle')}>
            <h2 className="text-lg font-bold text-charcoal">{t('dashboardBusinessTitle')}</h2>
            <p className="mt-1 text-sm text-charcoal/60">
              {periodLabel} · {t('dashboardDueThisMonth')}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              <WidgetCard
                title={t('kpiTotalPremium')}
                value={formatBdt(summary.totalPremium)}
                sub={
                  summary.deferredRatio !== null && summary.renewalRatio !== null
                    ? t('kpiSubRatios', {
                        deferred: summary.deferredRatio.toFixed(1),
                        renewal: summary.renewalRatio.toFixed(1),
                      })
                    : periodLabel
                }
                emptyText=""
                accent="orange"
                icon={<IconCoin />}
              />
              <WidgetCard
                title={t('kpiFycp')}
                value={formatBdt(summary.fycp)}
                sub={periodLabel}
                emptyText=""
                accent="olive"
                icon={<IconDashboard />}
              />
              <WidgetCard
                title={t('kpiPolicyQty')}
                value={fmtCount(summary.policies)}
                sub={`${periodLabel} · ${t('kpiSubNewPolicies')}`}
                emptyText=""
                accent="charcoal"
                icon={<IconCheck />}
              />
              <WidgetCard
                title={t('kpiDuePremium')}
                value={formatBdt(summary.duePremium)}
                sub={t('leadersPolicies', { count: summary.duePolicies })}
                emptyText=""
                accent="orange"
                icon={<IconCalculator />}
              />
              <WidgetCard
                title={t('kpiPersistency')}
                value={summary.persistency ? `${summary.persistency.pct.toFixed(1)}%` : '—'}
                sub={
                  summary.persistency
                    ? `${t('kpiSubCumulative')} · ${t('kpiSubPersistency', { inf: summary.persistency.inf, all: summary.persistency.all })}`
                    : t('kpiSubNoPolicies')
                }
                emptyText=""
                accent="olive"
                icon={<IconProfile />}
              />
              <WidgetCard
                title={t('kpiActiveFas')}
                value={t('kpiActiveFasValue', {
                  active: summary.activeFas.active,
                  total: summary.activeFas.total,
                })}
                sub={t('kpiSubActiveFas')}
                emptyText=""
                accent="charcoal"
                icon={<IconLeads />}
              />
            </div>
          </section>

          {/* Leaderboard — direct reports (Team Lead / Manager) or Top BEs (Admin) */}
          {summary.leaderboard.kind !== 'none' && (
            <section
              aria-label={
                summary.leaderboard.kind === 'bes'
                  ? t('dashboardLeadersBeTitle')
                  : t('dashboardLeadersReportsTitle')
              }
            >
              <h2 className="text-lg font-bold text-charcoal">
                {summary.leaderboard.kind === 'bes'
                  ? t('dashboardLeadersBeTitle')
                  : t('dashboardLeadersReportsTitle')}
              </h2>
              <p className="mt-1 text-sm text-charcoal/60">
                {summary.leaderboard.kind === 'bes'
                  ? t('dashboardLeadersBeSubtitle')
                  : t('dashboardLeadersReportsSubtitle')}
                {' · '}
                {periodLabel}
              </p>
              <div className="mt-3 rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5">
                {summary.leaderboard.entries.length === 0 ? (
                  <p className="text-base font-medium text-charcoal/70">{t('dashboardNoLeaders')}</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.leaderboard.entries.map((entry, i) => {
                      const max = summary.leaderboard.entries[0]?.premium || 1;
                      const pct = Math.round((entry.premium / max) * 100);
                      return (
                        <li key={entry.name}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold text-charcoal">
                              <span className="mr-2 font-bold tabular-nums text-charcoal/45">{i + 1}.</span>
                              {entry.name}
                            </p>
                            <p className="shrink-0 text-sm font-bold tabular-nums text-charcoal">
                              {formatBdt(entry.premium)}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-dark" role="presentation">
                              <div className="h-full rounded-full bg-olive" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="shrink-0 text-xs text-charcoal/55">
                              {t('leadersPolicies', { count: entry.policies })}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {summary.unassigned && (
                  <div className="mt-4 border-t border-cream-dark pt-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-charcoal/70">{t('dashboardUnassigned')}</p>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-charcoal/70">
                        {formatBdt(summary.unassigned.premium)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-charcoal/55">{t('dashboardUnassignedNote')}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Full Retail Sales Dashboard — filtering, charts and drill-downs live there */}
      {retailModule && (
        <section aria-label={t('dashboardOpenFull')}>
          <h2 className="text-lg font-bold text-charcoal">{t('dashboardOpenFull')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            <ModuleTile module={retailModule} />
          </div>
        </section>
      )}
    </div>
  );
}
