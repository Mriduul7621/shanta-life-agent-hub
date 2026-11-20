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
 * Live/Demo state.
 *
 * Home periods (Mahadi 2026-11-20): the retail and learning feeds
 * load with THIS_MONTH_SELECTION — business, FYCP, policy sales and
 * learning are monthly views. The LeadFlow feed loads with
 * ALL_TIME_SELECTION (follow-ups are day-bucketed, so the period
 * does not change them). Dues and due rows are period-independent
 * snapshots: the dues card shows THIS WEEK's dues (Bangladesh
 * calendar week, Sunday–Saturday, with the week range shown), the
 * Due widget shows the month-to-date totals + the 3 most recent
 * dues, and the Learning card shows THIS MONTH (credits earned this
 * month + courses in progress + courses completed this month).
 *
 * Business (FYCP this month) is LIVE when the retail feed is live —
 * the retail summary's this-month FYCP. The DEMO marker shows only
 * while the retail feed is demo or absent.
 *
 * Sales overview (Mahadi 2026-11-20): two THIS-MONTH retail cards —
 * Total policy sales (distinct New policies, same definition as the
 * Dashboard Policies KPI) and Total FYCP with New / Deferred premium
 * in small sub-text, scoped to the caller via the retail proxy.
 *
 * The retail summary is ONE scoped slice (own for employee, own+team
 * for team_lead, own+subtree for manager, org for admin) — it cannot
 * be split into own vs team, so in live mode the own grid's dues card
 * shows the scoped slice (labelled with scope + week range) and the
 * team section drops the dues and business cards (2-card grid:
 * follow-ups + learning) and the team Due widget.
 *
 * No subtitle under the page title (Mahadi 2026-11-20): the greeting
 * line + title stand alone, with the feed chips below.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { Lang } from '../i18n/dictionary';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { WidgetData } from '../data/demoData';
import { loadLeadflowCached, loadLeadflowFresh } from '../data/leadflowData';
import type { LeadflowSummary } from '../data/leadflowData';
import { loadLearningCached, loadLearningFresh } from '../data/learningData';
import type { LearningSummary } from '../data/learningData';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailScope, RetailSummary } from '../data/retailData';
import { ALL_TIME_SELECTION, THIS_MONTH_SELECTION } from '../data/period';
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

const fmtCount = (n: number): string => n.toLocaleString('en-IN');

/**
 * 'Sun 15 – Sat 21 Nov' when the week stays in one month, 'Sun 29 Nov –
 * Sat 5 Dec' across months — so the week definition is visible on the
 * dues card (the retail app has no week convention; the Hub's week is
 * the Bangladesh calendar week, Sunday–Saturday).
 */
function formatWeekRange(start: string, end: string, lang: Lang): string {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB';
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const day = (d: Date): string =>
    d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const month = (d: Date): string =>
    d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${day(s)} – ${day(e)} ${month(e)}`;
  }
  return `${day(s)} ${month(s)} – ${day(e)} ${month(e)}`;
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
  duesWeek,
  learningMonthly,
  businessDemo,
  hide,
}: {
  data: WidgetData;
  /** Set when the dues card shows the live retail slice (month + scope). */
  duesLiveScope?: RetailScope | null;
  /** The live week figures for the dues card (undefined = older proxy
   *  response without duesThisWeek → month figures instead). */
  duesWeek?: { count: number; amount: number; weekStart: string; weekEnd: string } | null;
  /** The live monthly learning figures for the own grid (undefined =
   *  demo or team grid → the course/team view instead). */
  learningMonthly?: { credits: number; inProgress: number; completed: number } | null;
  /** Set when the business card is still demo while other cards are live. */
  businessDemo?: boolean;
  hide?: CardId[];
}) {
  const { t, lang } = useI18n();
  const hidden = new Set(hide ?? []);
  const learningActive = data.learningCourse !== null || data.learningMembersCount != null;
  const learningSub =
    data.learningMembersCount != null
      ? t('teamLearningInProgress', { count: data.learningMembersCount })
      : (data.learningCourse ?? '');
  const duesLive = duesLiveScope != null;
  const learningMonthActive =
    learningMonthly !== null &&
    learningMonthly !== undefined &&
    (learningMonthly.credits > 0 || learningMonthly.inProgress > 0 || learningMonthly.completed > 0);
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
          title={t(duesLive ? (duesWeek ? 'widgetDues' : 'widgetDuesMonth') : 'widgetDues')}
          value={data.dues > 0 ? String(data.dues) : null}
          sub={
            duesLive && duesWeek
              ? `${t(SCOPE_KEY[duesLiveScope])} · ${formatWeekRange(duesWeek.weekStart, duesWeek.weekEnd, lang)} · ${data.dues} ${t('duesThisWeek')} · ${formatBdt(data.duesAmountBdt)}`
              : duesLive
                ? `${t(SCOPE_KEY[duesLiveScope])} · ${data.dues} ${t('duesThisMonth')} · ${formatBdt(data.duesAmountBdt)}`
                : `${data.dues} ${t('duesThisWeek')} · ${formatBdt(data.duesAmountBdt)}`
          }
          emptyText={t(duesLive ? (duesWeek ? 'widgetDuesEmpty' : 'widgetDuesMonthEmpty') : 'widgetDuesEmpty')}
          accent="olive"
          icon={<IconCoin />}
        />
      )}
      {!hidden.has('learning') && (
        <WidgetCard
          title={t(learningMonthly ? 'widgetLearningMonth' : 'widgetLearning')}
          value={
            learningMonthly
              ? learningMonthActive
                ? String(learningMonthly.credits)
                : null
              : learningActive
                ? `${data.learningProgressPct}%`
                : null
          }
          sub={
            learningMonthly
              ? t('learningMonthSub', {
                  inProgress: learningMonthly.inProgress,
                  completed: learningMonthly.completed,
                })
              : learningSub
          }
          emptyText={t(learningMonthly ? 'widgetLearningMonthEmpty' : 'widgetLearningEmpty')}
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
  // the page never shows a feed error state. Home periods (Mahadi
  // 2026-11-20): retail + learning load with THIS_MONTH_SELECTION
  // (business, FYCP, policy sales and learning are monthly views);
  // LeadFlow loads with ALL_TIME_SELECTION (follow-ups are
  // day-bucketed, so the period does not change them).
  useEffect(() => {
    if (!token || !employeeId) return;
    let cancelled = false;
    const cachedLeadflow = loadLeadflowCached(employeeId, ALL_TIME_SELECTION);
    if (cachedLeadflow) setLeadflow(cachedLeadflow.summary);
    const cachedLearning = loadLearningCached(employeeId, THIS_MONTH_SELECTION);
    if (cachedLearning) setLearning(cachedLearning.summary);
    const cachedRetail = loadRetailCached(employeeId, THIS_MONTH_SELECTION);
    if (cachedRetail) setRetail(cachedRetail.summary);
    void loadLeadflowFresh(token, employeeId, ALL_TIME_SELECTION)
      .then((r) => {
        if (!cancelled) setLeadflow(r.summary);
      })
      .catch(() => {});
    void loadLearningFresh(token, employeeId, THIS_MONTH_SELECTION)
      .then((r) => {
        if (!cancelled) setLearning(r.summary);
      })
      .catch(() => {});
    void loadRetailFresh(token, employeeId, THIS_MONTH_SELECTION)
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
  // Follow-ups are today-only (the LeadFlow summary buckets them by
  // Dhaka day). Dues are this week's when the proxy sends
  // duesThisWeek, else the month figures (older proxy). Business is
  // the live this-month FYCP when the retail feed has loaded.
  const own: WidgetData = { ...dashboard.own };
  if (leadflow) own.followups = leadflow.followups.today;
  const duesWeek = retail?.duesThisWeek ?? null;
  if (retail) {
    if (duesWeek) {
      own.dues = duesWeek.count;
      own.duesAmountBdt = duesWeek.amount;
    } else {
      own.dues = retail.duePolicies;
      own.duesAmountBdt = retail.duePremium;
    }
    own.businessFycpBdt = retail.fycp;
  }
  // Monthly learning (this-month period fields); coursesInProgress
  // is absent from older proxy responses — read defensively.
  const learningMonthly = learning
    ? {
        credits: learning.learning.creditsInPeriod,
        inProgress: learning.learning.coursesInProgress ?? 0,
        completed: learning.learning.completedInPeriod,
      }
    : null;
  // The business card is DEMO-labelled only while the retail feed is
  // demo or absent; with a live retail feed the FYCP is real.
  const businessDemo = anyLive && !(retail && !retail.demo);

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
      {/* Greeting — no subtitle under the title (Mahadi 2026-11-20). */}
      <section>
        <p className="text-sm font-semibold text-sunset">
          {t(greetingKey(hour))}, {user.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t('navHome')}
        </h1>
        <FeedChips leadflow={leadflow} learning={learning} retail={retail} />
      </section>

      {/* Own widgets — every role */}
      <WidgetGrid
        data={own}
        duesLiveScope={retail ? retail.scope : null}
        duesWeek={duesWeek}
        learningMonthly={learningMonthly}
        businessDemo={businessDemo}
      />

      {/* Due premiums — own dues: live retail summary when the feed has
          loaded, demo rows otherwise. The live widget shows the 3
          most recent dues above the month-to-date totals. */}
      {retail ? (
        <DuePremiumsWidget
          live={{
            duePolicies: retail.duePolicies,
            duePremium: retail.duePremium,
            dueMonth: retail.dueMonth,
            scope: retail.scope,
            demo: retail.demo,
            dueRows: retail.dueRows,
          }}
        />
      ) : (
        <DuePremiumsWidget data={dashboard.own} />
      )}

      {/* Sales overview — this-month retail figures (Total policy sales
          + Total FYCP with New / Deferred sub-text), scoped to the
          caller. Shown once the retail feed has loaded (live or
          fixture); no demo fallback — the figures are retail-only.
          An empty retail scope shows no cards at all (same rule as
          the Dashboard's empty state — never fixture figures). */}
      {retail && !retail.empty && (
        <section aria-label={t('homeSalesTitle')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-charcoal">{t('homeSalesTitle')}</h2>
            {retail.demo ? (
              <span className="rounded-full bg-sunset/15 px-2.5 py-1 text-xs font-bold text-sunset-dark">
                {t('dashboardDemoBadge')}
              </span>
            ) : (
              <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive">
                {t('dashboardLiveFrom')}
              </span>
            )}
            <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
              {t(SCOPE_KEY[retail.scope])} · {t('periodThisMonth')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <WidgetCard
              title={t('homeSalesPolicies')}
              value={fmtCount(retail.policies)}
              sub={t('homeSalesPoliciesSub')}
              emptyText=""
              accent="charcoal"
              icon={<IconCheck />}
            />
            <WidgetCard
              title={t('homeSalesFycp')}
              value={formatBdt(retail.fycp)}
              sub={t('homeSalesFycpSub', {
                new: formatBdt(retail.newPremium),
                deferred: formatBdt(retail.deferredPremium),
              })}
              emptyText=""
              accent="olive"
              icon={<IconCoin />}
            />
          </div>
        </section>
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
