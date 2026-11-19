/**
 * Dashboard page (Milestone 3) — the Sales Command Center summary as the
 * Hub's dashboard view (Plan A §06: "Sales Command Center joins as the
 * home dashboard").
 *
 * REAL DATA: the KPIs below come from the SCC's own Google Sheet, fetched
 * live as public gviz CSV (see sccData.ts / sccParse.ts) — the same source,
 * mapping and formulas the SCC app itself uses. Organisation-wide for every
 * role (no verified Employee-ID ↔ producer-code join exists for per-team
 * scoping — see M3_DESIGN.md §3.5); the scope is labelled on the page.
 *
 * Failure behaviour: if the live fetch fails, the page shows an error state
 * with a Retry button and the link to the full SCC — never a crash, never a
 * silent substitution of demo numbers for live ones. Cached data (this
 * browser session only) shows immediately while a fresh fetch runs in the
 * background; a failed refresh keeps the cached data and says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { loadSccCached, loadSccFresh } from '../data/sccData';
import type { SccLoadResult } from '../data/sccData';
import { formatBdt } from '../data/demoData';
import { MODULES } from '../data/modules';
import { WidgetCard } from '../components/WidgetCard';
import { ModuleTile } from '../components/ModuleTile';
import {
  IconCalculator,
  IconCheck,
  IconCoin,
  IconDashboard,
  IconLearning,
  IconLeads,
  IconProfile,
} from '../components/icons';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; result: SccLoadResult; refreshFailed: boolean }
  | { status: 'error' };

const fmtCount = (n: number): string => n.toLocaleString('en-IN');

function fmtSynced(syncedAt: number): string {
  return new Date(syncedAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ProgressRow({ label, count, total, accent }: { label: string; count: number; total: number; accent: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-charcoal/80">{label}</span>
        <span className="shrink-0 font-bold tabular-nums text-charcoal">
          {fmtCount(count)} <span className="font-medium text-charcoal/55">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream-dark" role="presentation">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const sccModule = MODULES.find((m) => m.id === 'sales-command-center');

  const refresh = useCallback(async () => {
    if (state.status === 'error') setState({ status: 'loading' });
    setRefreshing(true);
    try {
      const result = await loadSccFresh();
      setState({ status: 'ready', result, refreshFailed: false });
    } catch {
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, refreshFailed: true } : { status: 'error' },
      );
    } finally {
      setRefreshing(false);
    }
  }, [state.status]);

  useEffect(() => {
    let cancelled = false;
    const cached = loadSccCached();
    if (cached) setState({ status: 'ready', result: cached, refreshFailed: false });
    setRefreshing(true);
    loadSccFresh()
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
  }, []);

  const ready = state.status === 'ready' ? state.result : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t('groupDashboard')}
        </h1>
        <p className="mt-1 text-sm text-charcoal/60">{t('pageDashboardIntro')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
            {t('dashboardLiveFrom')}
          </span>
          <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
            {t('dashboardOrgWide')}
          </span>
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

      {ready && (
        <>
          {/* Sales KPIs — same formulas as the SCC SalesDashboard */}
          <section aria-label={t('dashboardSalesTitle')}>
            <h2 className="text-lg font-bold text-charcoal">{t('dashboardSalesTitle')}</h2>
            <p className="mt-1 text-sm text-charcoal/60">{t('dashboardSalesSubtitle')}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              <WidgetCard
                title={t('kpiNewPremium')}
                value={formatBdt(ready.summary.sales.totalVolume)}
                sub={t('kpiSubAllProducers')}
                emptyText=""
                accent="orange"
                icon={<IconCoin />}
              />
              <WidgetCard
                title={t('kpiPolicyQty')}
                value={fmtCount(ready.summary.sales.totalQty)}
                sub={t('kpiSubNewPolicies')}
                emptyText=""
                accent="olive"
                icon={<IconCheck />}
              />
              <WidgetCard
                title={t('kpiLifetimePremium')}
                value={formatBdt(ready.summary.sales.lifeTime)}
                sub={t('kpiSubAllTime')}
                emptyText=""
                accent="charcoal"
                icon={<IconDashboard />}
              />
              <WidgetCard
                title={t('kpiActiveProducers')}
                value={fmtCount(ready.summary.sales.activeProducers)}
                sub={t('kpiSubFaActive')}
                emptyText=""
                accent="olive"
                icon={<IconLeads />}
              />
              <WidgetCard
                title={t('kpiAvgPremiumFa')}
                value={formatBdt(ready.summary.sales.avgPremium)}
                sub={t('kpiSubPerActiveFa')}
                emptyText=""
                accent="orange"
                icon={<IconCalculator />}
              />
              <WidgetCard
                title={t('kpiAvgPolicyFa')}
                value={ready.summary.sales.avgPolicy}
                sub={t('kpiSubPerActiveFa')}
                emptyText=""
                accent="charcoal"
                icon={<IconProfile />}
              />
            </div>
          </section>

          {/* Training KPIs — same formulas as the SCC TrainingDashboard */}
          <section aria-label={t('dashboardTrainingTitle')}>
            <h2 className="text-lg font-bold text-charcoal">{t('dashboardTrainingTitle')}</h2>
            <p className="mt-1 text-sm text-charcoal/60">{t('dashboardTrainingSubtitle')}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
              <WidgetCard
                title={t('kpiTotalSessions')}
                value={ready.summary.sessionsOk ? fmtCount(ready.summary.training.totalSessions) : '—'}
                sub={ready.summary.sessionsOk ? t('kpiSubAllSessions') : t('dashboardSessionsUnavailable')}
                emptyText=""
                accent="charcoal"
                icon={<IconLearning />}
              />
              <WidgetCard
                title={t('kpiTotalParticipants')}
                value={ready.summary.sessionsOk ? fmtCount(ready.summary.training.totalParticipants) : '—'}
                sub={ready.summary.sessionsOk ? t('kpiSubTotalTrained') : t('dashboardSessionsUnavailable')}
                emptyText=""
                accent="olive"
                icon={<IconLeads />}
              />
              <WidgetCard
                title={t('kpiTotalCost')}
                value={ready.summary.sessionsOk ? formatBdt(ready.summary.training.totalCost) : '—'}
                sub={ready.summary.sessionsOk ? t('kpiSubAllSessions') : t('dashboardSessionsUnavailable')}
                emptyText=""
                accent="orange"
                icon={<IconCoin />}
              />
              <WidgetCard
                title={t('kpiFaTrained')}
                value={`${ready.summary.training.trainingPercent.toFixed(1)}%`}
                sub={t('kpiSubFaTrained', {
                  count: ready.summary.training.trainedCount,
                  total: ready.summary.training.totalAgents,
                })}
                emptyText=""
                accent="olive"
                icon={<IconCheck />}
              />
            </div>
            <div className="mt-3 rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-bold text-charcoal">{t('trainingDetailTitle')}</h3>
              <div className="mt-3 space-y-3">
                <ProgressRow
                  label={t('trainingBasic')}
                  count={ready.summary.training.basicTrained}
                  total={ready.summary.training.totalAgents}
                  accent="bg-olive"
                />
                <ProgressRow
                  label={t('trainingReview')}
                  count={ready.summary.training.reviewTrained}
                  total={ready.summary.training.totalAgents}
                  accent="bg-sunset"
                />
                <ProgressRow
                  label={t('trainingFoundation')}
                  count={ready.summary.training.foundationTrained}
                  total={ready.summary.training.totalAgents}
                  accent="bg-charcoal"
                />
                <div className="border-t border-cream-dark pt-3">
                  <ProgressRow
                    label={t('trainingGap')}
                    count={ready.summary.training.untrainedCount}
                    total={ready.summary.training.totalAgents}
                    accent="bg-sunset-dark"
                  />
                  <p className="mt-1 text-xs text-charcoal/55">
                    {ready.summary.training.untrainedCount === 1
                      ? t('trainingGapSubOne')
                      : t('trainingGapSub', { count: ready.summary.training.untrainedCount })}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Top GMs by new premium (Active rows only; orphans unranked) */}
          <section aria-label={t('dashboardLeadersTitle')}>
            <h2 className="text-lg font-bold text-charcoal">{t('dashboardLeadersTitle')}</h2>
            <p className="mt-1 text-sm text-charcoal/60">{t('dashboardLeadersSubtitle')}</p>
            <div className="mt-3 rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5">
              {ready.summary.leaderboard.top.length === 0 ? (
                <p className="text-base font-medium text-charcoal/70">{t('dashboardNoLeaders')}</p>
              ) : (
                <ul className="space-y-3">
                  {ready.summary.leaderboard.top.map((entry, i) => {
                    const max = ready.summary.leaderboard.top[0]?.premium || 1;
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
                            {t('leadersPolicies', { count: entry.qty })}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {ready.summary.leaderboard.unassigned && (
                <div className="mt-4 border-t border-cream-dark pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-charcoal/70">{t('dashboardUnassigned')}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-charcoal/70">
                      {formatBdt(ready.summary.leaderboard.unassigned.premium)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-charcoal/55">{t('dashboardUnassignedNote')}</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Full Sales Command Center — filtering, charts and admin tabs live there */}
      {sccModule && (
        <section aria-label={t('dashboardOpenFull')}>
          <h2 className="text-lg font-bold text-charcoal">{t('dashboardOpenFull')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            <ModuleTile module={sccModule} />
          </div>
        </section>
      )}
    </div>
  );
}
