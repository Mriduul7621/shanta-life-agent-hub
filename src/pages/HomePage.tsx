/**
 * Home — greeting, widget grids, due premiums, team section, quick
 * actions (Phase 2: live feeds).
 *
 * Each feed loads independently (stale-while-revalidate from the
 * session cache, then a fresh fetch): LeadFlow follow-ups, retail
 * dues, Learning Hub progress. While a feed is loading or unreachable,
 * its cards fall back to the DEMO figures from demoData.ts — the page
 * never blocks on a feed and never shows an error state for a feed
 * failure. A feed's figures replace the demo figures only when that
 * feed has loaded; a chips row under the greeting shows each feed's
 * Live/Demo state, and the role note switches from the demo note to
 * the live note as soon as ANY feed is live (demo:false).
 *
 * Business (FYCP this month) stays DEMO-labelled: the retail proxy
 * does not yet expose an fycpThisMonth field (Phase 2 extension,
 * out of this slice), so the business card keeps its demo figure with
 * an explicit DEMO marker whenever any feed is live.
 *
 * The retail summary is ONE scoped slice (own for employee, own+team
 * for team_lead, own+subtree for manager, org for admin) — it cannot
 * be split into own vs team, so in live mode the own grid's dues card
 * shows the scoped slice (labelled with scope + month) and the team
 * section drops the dues and business cards (2-card grid: follow-ups
 * + learning) and the team Due widget.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { WidgetData } from '../data/demoData';
import { loadLeadflowCached, loadLeadflowFresh } from '../data/leadflowData';
import type { LeadflowSummary } from '../data/leadflowData';
import { loadLearningCached, loadLearningFresh } from '../data/learningData';
import type { LearningSummary } from '../data/learningData';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailScope, RetailSummary } from '../data/retailData';
import { MODULES } from '../data/modules';
import { WidgetCard } from '../components/WidgetCard';
import { DuePremiumsWidget } from '../components/DuePremiumsWidget';
import { QuickActionTile } from '../components/QuickActionTile';
import { IconCheck, IconCoin, IconLearning, IconPhone } from '../components/icons';

function greetingKey(hour: number) {
  if (hour < 12) return 'greetingMorning' as const;
  if (hour < 18) return 'greetingAfternoon' as const;
  return 'greetingEvening' as const;
}

const SCOPE_KEY = {
  own: 'dashboardScopeOwn',
  team: 'dashboardScopeTeam',
  subtree: 'dashboardScopeSubtree',
  org: 'dashboardScopeOrg',
} as const;

type CardId = 'followups' | 'dues' | 'learning' | 'business';

function WidgetGrid({
  data,
  duesLiveScope,
  businessDemo,
  hide,
}: {
  data: WidgetData;
  /** Set when the dues card shows the live retail slice (month + scope). */
  duesLiveScope?: RetailScope | null;
  /** Set when the business card is still demo while other cards are live. */
  businessDemo?: boolean;
  hide?: CardId[];
}) {
  const { t } = useI18n();
  const hidden = new Set(hide ?? []);
  const learningActive = data.learningCourse !== null || data.learningMembersCount != null;
  const learningSub =
    data.learningMembersCount != null
      ? t('teamLearningInProgress', { count: data.learningMembersCount })
      : (data.learningCourse ?? '');
  const duesLive = duesLiveScope != null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      {!hidden.has('followups') && (
        <WidgetCard
          title={t('widgetFollowups')}
          value={data.followups > 0 ? String(data.followups) : null}
          sub={`${data.followups} ${t('followupsDue')}`}
          emptyText={t('widgetFollowupsEmpty')}
          accent="orange"
          icon={<IconPhone />}
        />
      )}
      {!hidden.has('dues') && (
        <WidgetCard
          title={t(duesLive ? 'widgetDuesMonth' : 'widgetDues')}
          value={data.dues > 0 ? String(data.dues) : null}
          sub={
            duesLive
              ? `${t(SCOPE_KEY[duesLiveScope])} · ${data.dues} ${t('duesThisMonth')} · ${formatBdt(data.duesAmountBdt)}`
              : `${data.dues} ${t('duesThisWeek')} · ${formatBdt(data.duesAmountBdt)}`
          }
          emptyText={t(duesLive ? 'widgetDuesMonthEmpty' : 'widgetDuesEmpty')}
          accent="olive"
          icon={<IconCoin />}
        />
      )}
      {!hidden.has('learning') && (
        <WidgetCard
          title={t('widgetLearning')}
          value={learningActive ? `${data.learningProgressPct}%` : null}
          sub={learningSub}
          emptyText={t('widgetLearningEmpty')}
          accent="charcoal"
          icon={<IconLearning />}
        />
      )}
      {!hidden.has('business') && (
        <WidgetCard
          title={t('widgetBusiness')}
          value={data.businessFycpBdt > 0 ? formatBdt(data.businessFycpBdt) : null}
          sub={businessDemo ? `${t('businessThisMonth')} · ${t('demoBadge')}` : t('businessThisMonth')}
          emptyText={t('widgetBusinessEmpty')}
          accent="orange"
          icon={<IconCheck />}
        />
      )}
    </div>
  );
}

function FeedChips({
  leadflow,
  learning,
  retail,
}: {
  leadflow: LeadflowSummary | null;
  learning: LearningSummary | null;
  retail: RetailSummary | null;
}) {
  const { t } = useI18n();
  const chips: { name: string; live: boolean }[] = [
    { name: t('feedNameLeadflow'), live: leadflow !== null && !leadflow.demo },
    { name: t('feedNameLearning'), live: learning !== null && !learning.demo },
    { name: t('feedNameRetail'), live: retail !== null && !retail.demo },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label={t('feedChipsLabel')}>
      {chips.map((chip) => (
        <span
          key={chip.name}
          className={
            chip.live
              ? 'rounded-full border border-olive/40 bg-olive/10 px-2.5 py-1 text-xs font-semibold text-olive'
              : 'rounded-full border border-sunset/40 bg-sunset/10 px-2.5 py-1 text-xs font-semibold text-sunset-dark'
          }
        >
          {chip.name} · {t(chip.live ? 'feedChipLive' : 'feedChipDemo')}
        </span>
      ))}
    </div>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const [leadflow, setLeadflow] = useState<LeadflowSummary | null>(null);
  const [learning, setLearning] = useState<LearningSummary | null>(null);
  const [retail, setRetail] = useState<RetailSummary | null>(null);
  const employeeId = user?.employeeId ?? '';

  // Each feed loads independently: cached first, fresh in the
  // background. A failed fetch leaves the demo fallback in place —
  // the page never shows a feed error state.
  useEffect(() => {
    if (!token || !employeeId) return;
    let cancelled = false;
    const cachedLeadflow = loadLeadflowCached(employeeId);
    if (cachedLeadflow) setLeadflow(cachedLeadflow.summary);
    const cachedLearning = loadLearningCached(employeeId);
    if (cachedLearning) setLearning(cachedLearning.summary);
    const cachedRetail = loadRetailCached(employeeId);
    if (cachedRetail) setRetail(cachedRetail.summary);
    void loadLeadflowFresh(token, employeeId)
      .then((r) => {
        if (!cancelled) setLeadflow(r.summary);
      })
      .catch(() => {});
    void loadLearningFresh(token, employeeId)
      .then((r) => {
        if (!cancelled) setLearning(r.summary);
      })
      .catch(() => {});
    void loadRetailFresh(token, employeeId)
      .then((r) => {
        if (!cancelled) setRetail(r.summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, employeeId]);

  if (!user) return null;

  const dashboard = DEMO_DASHBOARDS[user.role];
  const hour = new Date().getHours();

  const anyLive =
    (leadflow !== null && !leadflow.demo) ||
    (learning !== null && !learning.demo) ||
    (retail !== null && !retail.demo);
  const feedsLoaded = leadflow !== null || learning !== null || retail !== null;

  // Own grid: demo figures, overridden per feed as it loads.
  const own: WidgetData = { ...dashboard.own };
  if (leadflow) own.followups = leadflow.followups.today;
  if (retail) {
    own.dues = retail.duePolicies;
    own.duesAmountBdt = retail.duePremium;
  }
  if (learning) {
    own.learningCourse = learning.learning.currentCourse?.title ?? null;
    own.learningProgressPct = learning.learning.currentCourse?.percent ?? 0;
  }

  // Team grid: demo figures, overridden per feed. In live mode the
  // team section is a 2-card grid (follow-ups + learning): dues live
  // in the own grid's scoped retail slice and business is pending.
  const team: WidgetData | null = dashboard.team ? { ...dashboard.team } : null;
  if (team && leadflow?.team) team.followups = leadflow.team.followups.today;
  if (team && learning?.team) {
    team.learningProgressPct = learning.team.avgProgress;
    team.learningMembersCount = learning.team.learningMembersCount;
  }
  const teamSize =
    leadflow?.team?.teamSize ?? learning?.team?.teamSize ?? dashboard.teamSize;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Greeting */}
      <section>
        <p className="text-sm font-semibold text-sunset">
          {t(greetingKey(hour))}, {user.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t('navHome')}
        </h1>
        <p className="mt-1 text-sm text-charcoal/60">
          {t('homeSubtitle')} {t(anyLive ? 'homeLiveNote' : 'demoRoleNote')}
        </p>
        <FeedChips leadflow={leadflow} learning={learning} retail={retail} />
      </section>

      {/* Own widgets — every role */}
      <WidgetGrid
        data={own}
        duesLiveScope={retail ? retail.scope : null}
        businessDemo={anyLive}
      />

      {/* Due premiums — own dues: live retail summary when the feed has
          loaded, demo rows otherwise. */}
      {retail ? (
        <DuePremiumsWidget
          live={{
            duePolicies: retail.duePolicies,
            duePremium: retail.duePremium,
            dueMonth: retail.dueMonth,
            scope: retail.scope,
            demo: retail.demo,
          }}
        />
      ) : (
        <DuePremiumsWidget data={dashboard.own} />
      )}

      {/* Team section — Team Lead and Manager only */}
      {team && (
        <section aria-label={t('teamSectionTitle')}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-bold text-charcoal">{t('teamSectionTitle')}</h2>
            <p className="text-sm text-charcoal/60">
              {teamSize} {t('teamMembers')}
            </p>
          </div>
          <p className="mb-3 text-sm text-charcoal/60">{t('teamSectionSubtitle')}</p>
          <WidgetGrid
            data={team}
            businessDemo={anyLive}
            hide={feedsLoaded ? ['dues', 'business'] : undefined}
          />
          {/* Team dues widget only in demo mode — in live mode the team
              dues are inside the own grid's scoped retail slice. */}
          {!feedsLoaded && (
            <div className="mt-3 sm:mt-4">
              <DuePremiumsWidget data={team} />
            </div>
          )}
        </section>
      )}

      {/* Quick actions — one flat grid, icon + name (Mahadi 2026-11-20).
          No group sections: every tool is one tap away, like an app
          launcher. Tapping opens the app same-tab (see QuickActionTile). */}
      <section aria-label={t('modulesTitle')}>
        <h2 className="text-lg font-bold text-charcoal">{t('modulesTitle')}</h2>
        <p className="mt-1 text-sm text-charcoal/60">{t('modulesSubtitle')}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-7">
          {MODULES.map((m) => (
            <QuickActionTile key={m.id} module={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
