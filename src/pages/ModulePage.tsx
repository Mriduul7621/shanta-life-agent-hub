/**
 * Module pages (Phase 2: live feeds on Leads + Learning).
 *
 * Leads and Learning are data pages (Mahadi 2026-11-20): a summary
 * strip + a prominent Go button. The summary loads from the Hub
 * proxies (LeadFlow + retail for Leads, Learning Hub for Learning),
 * stale-while-revalidate from the session cache, with one retry on
 * a failed fetch.
 *
 * NO DEMO ANYWHERE (Mahadi 2026-11-20): the demo fallback is gone
 * entirely — no demo figures, no DEMO badge, no "live data arrives"
 * note, no Live chip, no last-synced line. Three states per page:
 * - loading (no summary yet): pulsing skeleton blocks, no numbers.
 * - error (fetch failed, nothing cached): an error message + a
 *   retry button.
 * - ready: the live figures and extra stats.
 * The retail dues slice on the Leads page loads independently, so
 * it has its own loading / unavailable state inside an otherwise
 * ready strip.
 *
 * The retail dues slice is ONE scoped summary (own / own+team /
 * own+subtree / org) — it cannot be split into own vs team, so the
 * Leads page shows dues only in the own block (labelled with scope
 * + month) and the team block shows follow-ups only. Calculators
 * and Proposals stay tiles-only — they are tools, not data pages.
 *
 * Time-frame filter: the LeadFlow and Learning Hub feeds follow the
 * selected period (new leads by created_at; enrolments, completions
 * and credits by their timestamps); follow-ups, open/converted
 * counts, certificates and current progress are snapshots, labelled
 * as such. The retail dues on the Leads page stay 'all' — dues are
 * this-calendar-month by definition. Default is Today; the selector
 * is a dropdown with a Custom range (start/end dates).
 *
 * No sentence under any title (Mahadi 2026-11-20): page and section
 * titles stand alone — no subtitles, no notes, no badges.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatBdt } from '../data/format';
import { loadLeadflowCached, loadLeadflowFresh } from '../data/leadflowData';
import type { LeadflowSummary } from '../data/leadflowData';
import { loadLearningCached, loadLearningFresh } from '../data/learningData';
import type { LearningSummary } from '../data/learningData';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailSummary } from '../data/retailData';
import { useFeed } from '../data/useFeed';
import type { FeedStatus } from '../data/useFeed';
import { ALL_TIME_SELECTION, DEFAULT_SELECTION, isCompleteSelection, periodLabelKey, type PeriodSelection } from '../data/period';
import PeriodSelector from '../components/PeriodSelector';
import { GROUP_TITLE_KEY, MODULES } from '../data/modules';
import type { HubModule, ModuleGroup } from '../data/modules';
import { ModuleTile } from '../components/ModuleTile';
import { ModuleIcon } from '../components/ModuleIcon';
import { buildModuleUrl } from '../sso/handoff';
import { prefetchModule } from '../performance/prefetch';
import type { DictKey } from '../i18n/dictionary';
import type { View } from '../components/Layout';

const VIEW_TO_GROUP: Partial<Record<View, ModuleGroup>> = {
  leads: 'leads',
  learning: 'learning',
  calculators: 'calculators',
  proposals: 'proposals',
};

const SCOPE_KEY = {
  own: 'dashboardScopeOwn',
  team: 'dashboardScopeTeam',
  subtree: 'dashboardScopeSubtree',
  org: 'dashboardScopeOrg',
} as const;

/** One mini-stat inside a summary strip: label above, value below. */
function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-charcoal/60">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight text-charcoal">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-charcoal/60">{sub}</p>}
    </div>
  );
}

/** Pulsing skeleton blocks while a summary loads — no numbers. */
function SummarySkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true">
      <p className="text-sm font-medium text-charcoal/60">{t('moduleLoading')}</p>
      <div aria-hidden className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="h-3 w-20 animate-pulse rounded bg-cream-dark/70" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-cream-dark/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Error state with retry when a summary fetch failed. */
function SummaryError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-base font-medium text-charcoal/70">{t('moduleLoadError')}</p>
      <p className="mt-1 text-sm text-charcoal/60">{t('moduleLoadErrorDetail')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-10 rounded-xl bg-charcoal px-4 text-sm font-semibold text-white transition-colors hover:bg-charcoal/90"
      >
        {t('feedRetry')}
      </button>
    </div>
  );
}

/** Summary strip shell — title only, no badge, no note, no synced line. */
function SummaryCard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('moduleSummaryTitle')}
      className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-base font-bold text-charcoal">{t('moduleSummaryTitle')}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Leads summary: follow-ups due + dues this month, own then team.
 * The retail dues cell has its own feed state: a loaded retail feed
 * shows the scoped dues, a loading one shows '—' + the loading text,
 * a failed one '—' + the unavailable text (the strip-level retry
 * button below retries both feeds).
 */
function LeadsSummary({
  leadflow,
  retail,
  retailStatus,
  periodLabel,
}: {
  leadflow: LeadflowSummary;
  retail: RetailSummary | null;
  retailStatus: FeedStatus;
  periodLabel: string;
}) {
  const { t } = useI18n();
  const duesSub = retail
    ? `${t(SCOPE_KEY[retail.scope])} · ${retail.duePolicies} ${t('duesThisMonth')} · ${formatBdt(retail.duePremium)}`
    : retailStatus === 'loading'
      ? t('leadsDuesLoading')
      : t('leadsDuesUnavailable');
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatBlock label={t('widgetFollowups')} value={String(leadflow.followups.today)} sub={t('followupsDue')} />
        <StatBlock
          label={t('widgetDuesMonth')}
          value={retail ? String(retail.duePolicies) : '—'}
          sub={duesSub}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatBlock
          label={t('leadsNewLeads')}
          value={String(leadflow.leads.createdInPeriod)}
          sub={periodLabel}
        />
        <StatBlock label={t('leadsOverdue')} value={String(leadflow.followups.overdue)} sub={t('snapshotNow')} />
        <StatBlock label={t('leadsOpen')} value={String(leadflow.leads.open)} sub={t('snapshotNow')} />
        <StatBlock
          label={t('leadsConverted')}
          value={String(leadflow.leads.converted)}
          sub={t('periodAllTime')}
        />
      </div>
      {leadflow.team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatBlock
              label={t('widgetFollowups')}
              value={String(leadflow.team.followups.today)}
              sub={t('followupsDue')}
            />
            <StatBlock
              label={t('leadsNewLeads')}
              value={String(leadflow.team.leads.createdInPeriod)}
              sub={periodLabel}
            />
            <StatBlock
              label={t('leadsOpen')}
              value={String(leadflow.team.leads.open)}
              sub={t('snapshotNow')}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Learning summary: progress % + current course, own then team. */
function LearningSummary({
  learning,
  periodLabel,
}: {
  learning: LearningSummary;
  periodLabel: string;
}) {
  const { t } = useI18n();
  const course = learning.learning.currentCourse;
  return (
    <>
      {course ? (
        <StatBlock label={t('widgetLearning')} value={`${course.percent}%`} sub={course.title} />
      ) : (
        <p className="text-base font-medium text-charcoal/70">{t('widgetLearningEmpty')}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatBlock
          label={t('learningEnrolled')}
          value={String(learning.learning.enrolledInPeriod)}
          sub={periodLabel}
        />
        <StatBlock
          label={t('learningCompleted')}
          value={String(learning.learning.completedInPeriod)}
          sub={periodLabel}
        />
        <StatBlock
          label={t('learningCertificates')}
          value={String(learning.learning.certificates)}
          sub={t('periodAllTime')}
        />
        <StatBlock
          label={t('learningCredits')}
          value={String(learning.learning.creditsInPeriod)}
          sub={periodLabel}
        />
      </div>
      {learning.team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          <StatBlock
            label={t('widgetLearning')}
            value={`${learning.team.avgProgress}%`}
            sub={t('teamLearningInProgress', { count: learning.team.learningMembersCount })}
          />
        </div>
      )}
    </>
  );
}

/**
 * The prominent Go button that replaces the ModuleTile on the Leads and
 * Learning pages: same-tab link to the app (SSO fragment when the module
 * has joined, plain link until then), with intent-based prefetch like
 * the tiles (instant-open).
 */
function GoButton({ module, labelKey }: { module: HubModule; labelKey: DictKey }) {
  const { t } = useI18n();
  const { token } = useAuth();
  const href = module.ssoJoined ? buildModuleUrl(module, token) : module.url;
  const warm = () => prefetchModule(module.url);
  return (
    <a
      href={href ?? undefined}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-charcoal px-5 text-base font-semibold text-white transition-colors hover:bg-charcoal/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunset"
    >
      <ModuleIcon module={module} className="h-8 w-8" />
      {t(labelKey)} →
    </a>
  );
}

export function ModulePage({ view }: { view: View }) {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const [selection, setSelection] = useState<PeriodSelection>(DEFAULT_SELECTION);
  const employeeId = user?.employeeId ?? '';
  const group = VIEW_TO_GROUP[view];
  const periodLabel =
    selection.period === 'custom' && selection.from && selection.to
      ? `${selection.from} – ${selection.to}`
      : t(periodLabelKey(selection.period));
  const selectionReady = isCompleteSelection(selection);

  // Leads loads the LeadFlow + retail feeds; Learning loads the
  // Learning Hub feed. Each loads independently (cached first, fresh
  // in the background with one retry); a failed fetch with no cache
  // shows the error state with retry. The LeadFlow + Learning feeds
  // follow the period; the retail dues feed is ALWAYS all-time
  // (dues are this-calendar-month by definition). An incomplete
  // custom selection (no range yet) skips fetching and keeps the
  // last summary.
  const leadflowFeed = useFeed(
    loadLeadflowCached,
    loadLeadflowFresh,
    token,
    employeeId,
    selection,
    group === 'leads' && selectionReady,
  );
  const retailFeed = useFeed(
    loadRetailCached,
    loadRetailFresh,
    token,
    employeeId,
    ALL_TIME_SELECTION,
    group === 'leads',
  );
  const learningFeed = useFeed(
    loadLearningCached,
    loadLearningFresh,
    token,
    employeeId,
    selection,
    group === 'learning' && selectionReady,
  );

  if (!group) return null;
  const tiles = MODULES.filter((m) => m.group === group);

  // Leads and Learning are data pages (Mahadi 2026-11-20): a summary
  // strip + a Go button. Calculators and Proposals stay tiles-only — they
  // are tools, not data pages.
  const dataGroup = group === 'leads' || group === 'learning';
  const goModule =
    group === 'leads'
      ? MODULES.find((m) => m.id === 'leadflow')
      : group === 'learning'
        ? MODULES.find((m) => m.id === 'learning-hub')
        : undefined;

  const mainFeed = group === 'leads' ? leadflowFeed : group === 'learning' ? learningFeed : null;
  const summary = mainFeed?.summary ?? null;
  const status = mainFeed?.status ?? 'loading';
  // On the Leads page the retail feed can fail while LeadFlow loads:
  // the strip shows the lead figures with the dues cell unavailable,
  // plus a retry button that retries both feeds.
  const retailFailed = group === 'leads' && retailFeed.summary === null && retailFeed.status === 'error';
  const retryAll = () => {
    mainFeed?.retry();
    if (group === 'leads') retailFeed.retry();
  };

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t(GROUP_TITLE_KEY[group])}
        </h1>
      </section>
      {dataGroup && user ? (
        <>
          <PeriodSelector value={selection} onChange={setSelection} />
          <SummaryCard>
            {summary ? (
              group === 'leads' ? (
                <LeadsSummary
                  leadflow={summary as LeadflowSummary}
                  retail={retailFeed.summary}
                  retailStatus={retailFeed.status}
                  periodLabel={periodLabel}
                />
              ) : (
                <LearningSummary learning={summary as LearningSummary} periodLabel={periodLabel} />
              )
            ) : status === 'loading' ? (
              <SummarySkeleton />
            ) : (
              <SummaryError onRetry={retryAll} />
            )}
            {summary && retailFailed && (
              <div>
                <p className="text-base font-medium text-charcoal/70">{t('moduleLoadError')}</p>
                <button
                  type="button"
                  onClick={retryAll}
                  className="mt-3 min-h-10 rounded-xl bg-charcoal px-4 text-sm font-semibold text-white transition-colors hover:bg-charcoal/90"
                >
                  {t('feedRetry')}
                </button>
              </div>
            )}
          </SummaryCard>
          {goModule && (
            <GoButton
              module={goModule}
              labelKey={group === 'leads' ? 'goToLeadManagement' : 'goToLearning'}
            />
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {tiles.map((m) => (
            <ModuleTile key={m.id} module={m} />
          ))}
        </div>
      )}
    </div>
  );
}
