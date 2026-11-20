/**
 * Module pages (Phase 2: live feeds on Leads + Learning).
 *
 * Leads and Learning are data pages (Mahadi 2026-11-20): a summary
 * strip + a prominent Go button. The summary loads from the Hub
 * proxies (LeadFlow + retail for Leads, Learning Hub for Learning),
 * stale-while-revalidate from the session cache, with the DEMO
 * figures from demoData.ts as the fallback while a feed is loading
 * or unreachable. Three states per page:
 * - unloaded (no summary yet): DEMO badge + the "live data arrives
 *   with the connection" note + demo figures.
 * - fixture (summary.demo): DEMO badge + the preview note + fixture
 *   figures (identical to the demo figures by design).
 * - live (summary.demo === false): "Live from …" chip + last-synced
 *   time + live note + live figures and extra stats.
 *
 * The retail dues slice is ONE scoped summary (own / own+team /
 * own+subtree / org) — it cannot be split into own vs team, so in
 * live mode the Leads page shows dues only in the own block
 * (labelled with scope + month) and the team block shows follow-ups
 * only. Calculators and Proposals stay tiles-only — they are tools,
 * not data pages.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { RoleDashboard } from '../data/demoData';
import { loadLeadflowCached, loadLeadflowFresh } from '../data/leadflowData';
import type { LeadflowSummary } from '../data/leadflowData';
import { loadLearningCached, loadLearningFresh } from '../data/learningData';
import type { LearningSummary } from '../data/learningData';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailSummary } from '../data/retailData';
import { GROUP_TITLE_KEY, MODULES } from '../data/modules';
import type { HubModule, ModuleGroup } from '../data/modules';
import { ModuleTile } from '../components/ModuleTile';
import { ModuleIcon } from '../components/ModuleIcon';
import { buildModuleUrl } from '../sso/handoff';
import { prefetchModule } from '../performance/prefetch';
import type { DictKey } from '../i18n/dictionary';
import type { View } from '../components/Layout';

const INTRO_KEY: Partial<Record<ModuleGroup, DictKey>> = {
  leads: 'pageLeadsIntro',
  learning: 'pageLearningIntro',
  calculators: 'pageCalculatorsIntro',
  proposals: 'pageProposalsIntro',
};

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

/** 'unloaded' | 'fixture' (demo summary) | 'live' (real summary). */
type SummaryMode = 'unloaded' | 'fixture' | 'live';

function modeOf(summary: { demo: boolean } | null): SummaryMode {
  if (!summary) return 'unloaded';
  return summary.demo ? 'fixture' : 'live';
}

function fmtSynced(syncedAt: number): string {
  return new Date(syncedAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

/**
 * Summary strip shell. Demo/fixture mode: DEMO badge + note. Live
 * mode: "Live from …" chip + last-synced time + live note.
 */
function SummaryCard({
  mode,
  noteKey,
  liveFromKey,
  syncedAt,
  children,
}: {
  mode: SummaryMode;
  noteKey: DictKey;
  liveFromKey?: DictKey;
  syncedAt?: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const live = mode === 'live';
  return (
    <section
      aria-label={t('moduleSummaryTitle')}
      className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-charcoal">{t('moduleSummaryTitle')}</h2>
        {live && liveFromKey ? (
          <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
            {t(liveFromKey)}
          </span>
        ) : (
          <span className="rounded-full bg-sunset/15 px-2.5 py-1 text-xs font-bold text-sunset-dark">
            {t('demoBadge')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-charcoal/60">{t(noteKey)}</p>
      {live && syncedAt != null && (
        <p className="mt-1 text-xs text-charcoal/55">
          {t('dashboardLastSynced', { time: fmtSynced(syncedAt) })}
        </p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Leads summary: follow-ups due + dues this month, own then team. */
function LeadsSummary({
  dashboard,
  leadflow,
  retail,
}: {
  dashboard: RoleDashboard;
  leadflow: LeadflowSummary | null;
  retail: RetailSummary | null;
}) {
  const { t } = useI18n();
  const live = leadflow !== null;
  const own = dashboard.own;
  const team = dashboard.team;
  const followups = leadflow ? leadflow.followups.today : own.followups;
  const dues = retail ? retail.duePolicies : own.dues;
  const duesAmount = retail ? retail.duePremium : own.duesAmountBdt;
  const duesSub = retail
    ? `${t(SCOPE_KEY[retail.scope])} · ${dues} ${t('duesThisMonth')} · ${formatBdt(duesAmount)}`
    : `${t('duesThisWeek')} · ${formatBdt(duesAmount)}`;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatBlock label={t('widgetFollowups')} value={String(followups)} sub={t('followupsDue')} />
        <StatBlock
          label={t(retail ? 'widgetDuesMonth' : 'widgetDues')}
          value={String(dues)}
          sub={duesSub}
        />
      </div>
      {live && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatBlock label={t('leadsOverdue')} value={String(leadflow.followups.overdue)} />
          <StatBlock label={t('leadsOpen')} value={String(leadflow.leads.open)} />
          <StatBlock label={t('leadsConverted')} value={String(leadflow.leads.converted)} />
        </div>
      )}
      {team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          {live && leadflow.team ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatBlock
                label={t('widgetFollowups')}
                value={String(leadflow.team.followups.today)}
                sub={t('followupsDue')}
              />
              <StatBlock label={t('leadsOpen')} value={String(leadflow.team.leads.open)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatBlock label={t('widgetFollowups')} value={String(team.followups)} sub={t('followupsDue')} />
              <StatBlock
                label={t('widgetDues')}
                value={String(team.dues)}
                sub={`${t('duesThisWeek')} · ${formatBdt(team.duesAmountBdt)}`}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Learning summary: progress % + current course, own then team. */
function LearningSummary({
  dashboard,
  learning,
}: {
  dashboard: RoleDashboard;
  learning: LearningSummary | null;
}) {
  const { t } = useI18n();
  const own = dashboard.own;
  const team = dashboard.team;
  const live = learning !== null;
  const course = live ? learning.learning.currentCourse : null;
  // Live mode uses ONLY the summary: an empty summary (no LMS record
  // / no learning yet) shows the empty state, never the demo course.
  const ownCourse = live ? (course?.title ?? null) : own.learningCourse;
  const ownPct = live ? (course?.percent ?? 0) : own.learningProgressPct;
  const teamPct = live && learning.team ? learning.team.avgProgress : (team?.learningProgressPct ?? 0);
  const teamMembers =
    live && learning.team ? learning.team.learningMembersCount : (team?.learningMembersCount ?? 0);
  return (
    <>
      {ownCourse ? (
        <StatBlock label={t('widgetLearning')} value={`${ownPct}%`} sub={ownCourse} />
      ) : (
        <p className="text-base font-medium text-charcoal/70">{t('widgetLearningEmpty')}</p>
      )}
      {live && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatBlock label={t('learningEnrolled')} value={String(learning.learning.coursesEnrolled)} />
          <StatBlock label={t('learningCompleted')} value={String(learning.learning.coursesCompleted)} />
          <StatBlock label={t('learningCertificates')} value={String(learning.learning.certificates)} />
          <StatBlock label={t('learningCredits')} value={String(learning.learning.creditBalance)} />
        </div>
      )}
      {team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          <StatBlock
            label={t('widgetLearning')}
            value={`${teamPct}%`}
            sub={t('teamLearningInProgress', { count: teamMembers })}
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
  const [leadflow, setLeadflow] = useState<LeadflowSummary | null>(null);
  const [learning, setLearning] = useState<LearningSummary | null>(null);
  const [retail, setRetail] = useState<RetailSummary | null>(null);
  const employeeId = user?.employeeId ?? '';
  const group = VIEW_TO_GROUP[view];

  // Leads loads the LeadFlow + retail feeds; Learning loads the
  // Learning Hub feed. Each loads independently (cached first, fresh
  // in the background); a failed fetch leaves the demo fallback.
  useEffect(() => {
    if (!token || !employeeId || !group) return;
    let cancelled = false;
    if (group === 'leads') {
      const cachedLeadflow = loadLeadflowCached(employeeId);
      if (cachedLeadflow) setLeadflow(cachedLeadflow.summary);
      const cachedRetail = loadRetailCached(employeeId);
      if (cachedRetail) setRetail(cachedRetail.summary);
      void loadLeadflowFresh(token, employeeId)
        .then((r) => {
          if (!cancelled) setLeadflow(r.summary);
        })
        .catch(() => {});
      void loadRetailFresh(token, employeeId)
        .then((r) => {
          if (!cancelled) setRetail(r.summary);
        })
        .catch(() => {});
    }
    if (group === 'learning') {
      const cachedLearning = loadLearningCached(employeeId);
      if (cachedLearning) setLearning(cachedLearning.summary);
      void loadLearningFresh(token, employeeId)
        .then((r) => {
          if (!cancelled) setLearning(r.summary);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [token, employeeId, group]);

  if (!group) return null;
  const tiles = MODULES.filter((m) => m.group === group);
  const introKey = INTRO_KEY[group];
  const dashboard = user ? DEMO_DASHBOARDS[user.role] : null;

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

  const summary = group === 'leads' ? leadflow : group === 'learning' ? learning : null;
  const mode = modeOf(summary);
  const noteKey: DictKey =
    mode === 'live'
      ? group === 'leads'
        ? 'leadsLiveNote'
        : 'learningLiveNote'
      : mode === 'fixture'
        ? 'dashboardDemoNote'
        : group === 'leads'
          ? 'leadsDemoNote'
          : 'learningDemoNote';

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t(GROUP_TITLE_KEY[group])}
        </h1>
        {introKey && <p className="mt-1 text-sm text-charcoal/60">{t(introKey)}</p>}
        {group === 'proposals' && (
          <p className="mt-3 rounded-xl bg-olive/10 px-4 py-3 text-sm font-medium text-charcoal">
            {t('pageProposalsNote')}
          </p>
        )}
      </section>
      {dataGroup && dashboard ? (
        <>
          <SummaryCard
            mode={mode}
            noteKey={noteKey}
            liveFromKey={group === 'leads' ? 'feedLiveLeadflow' : 'feedLiveLearning'}
            syncedAt={summary?.syncedAt}
          >
            {group === 'leads' ? (
              <LeadsSummary dashboard={dashboard} leadflow={leadflow} retail={retail} />
            ) : (
              <LearningSummary dashboard={dashboard} learning={learning} />
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
