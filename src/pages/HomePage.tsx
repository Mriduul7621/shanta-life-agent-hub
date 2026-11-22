/**
 * Home — greeting, widget grids, due premiums, team section, quick
 * actions (Phase 2: live feeds).
 *
 * Each feed loads independently (stale-while-revalidate from the
 * session cache, then a fresh fetch with one retry): LeadFlow
 * follow-ups, retail dues, Learning Hub progress.
 *
 * NO DEMO ANYWHERE (Mahadi 2026-11-20): the demo data, the demo
 * fallback branches and the feed chips are all gone — removed
 * entirely, not gated. Every user sees the same three states per
 * feed: loading skeletons (pulsing placeholders, no fake numbers)
 * while a feed loads, honest empty states when a feed returns
 * empty:true (zeros + the existing emptyText strings), and an error
 * state with a retry action when a fresh fetch fails. (2026-11-20:
 * a real employee's retail fetch failed transiently and Home showed
 * her the old employee fixture — dues 2 / ৳48,500, business
 * ৳1,85,000 — as if it were her data. That path no longer exists.)
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
 * Sales overview (Mahadi 2026-11-20): two THIS-MONTH retail cards —
 * Total policy sales (distinct New policies, same definition as the
 * Dashboard Policies KPI) and Total FYCP with New / Deferred premium
 * in small sub-text, scoped to the caller via the retail proxy.
 *
 * The retail summary is ONE scoped slice (own for employee, own+team
 * for team_lead, own+subtree for manager, org for admin) — it cannot
 * be split into own vs team, so the own grid's dues card shows the
 * scoped slice (labelled with scope + week range) and the team
 * section is a 2-card grid (follow-ups + learning), with no team
 * Due widget.
 *
 * No sentence under any title (Mahadi 2026-11-20): page and section
 * titles stand alone — no subtitles, no live/demo notes, no feed
 * chips. The scope label (Own / Own + team / Org-wide) stays: it
 * tells the user whose data the figures are.
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import type { Lang } from '../i18n/dictionary';
import { formatBdt } from '../data/format';
import { shouldShowAndroidPromo } from '../data/appDownload';
import { loadLeadflowCached, loadLeadflowFresh } from '../data/leadflowData';
import type { LeadflowSummary } from '../data/leadflowData';
import { loadLearningCached, loadLearningFresh } from '../data/learningData';
import type { LearningSummary } from '../data/learningData';
import { loadRetailCached, loadRetailFresh } from '../data/retailData';
import type { RetailSummary } from '../data/retailData';
import { useFeed } from '../data/useFeed';
import type { FeedStatus } from '../data/useFeed';
import { ALL_TIME_SELECTION, THIS_MONTH_SELECTION } from '../data/period';
import { MODULES } from '../data/modules';
import { FeedErrorCard, WidgetCard, WidgetSkeleton } from '../components/WidgetCard';
import { AndroidAppPromo } from '../components/AndroidAppPromo';
import { DuePremiumsWidget } from '../components/DuePremiumsWidget';
import { QuickActionTile } from '../components/QuickActionTile';

function greetingKey(hour: number) {
  if (hour < 12) return 'greetingMorning' as const;
  if (hour < 18) return 'greetingAfternoon' as const;
  return 'greetingEvening' as const;
}

const NAME_PREFIXES = new Set(['md', 'mohammad', 'mohammed', 'mr', 'mrs', 'ms', 'dr']);

/** First name for the greeting (board + LH precedent: first name only). */
function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.find((part) => !NAME_PREFIXES.has(part.toLowerCase().replace(/\./g, ''))) ?? fullName;
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

/**
 * Own widget grid: every card renders from its own feed's state —
 * live figures when loaded (an empty feed shows the plain empty
 * text, never a placeholder figure), a loading skeleton while the
 * feed loads, an error card with retry when the fetch failed.
 */
function WidgetGrid({
  leadflow,
  leadflowStatus,
  onRetryLeadflow,
  learning,
  learningStatus,
  onRetryLearning,
  retail,
  retailStatus,
  onRetryRetail,
}: {
  leadflow: LeadflowSummary | null;
  leadflowStatus: FeedStatus;
  onRetryLeadflow: () => void;
  learning: LearningSummary | null;
  learningStatus: FeedStatus;
  onRetryLearning: () => void;
  retail: RetailSummary | null;
  retailStatus: FeedStatus;
  onRetryRetail: () => void;
}) {
  const { t, lang } = useI18n();
  const duesWeek = retail?.duesThisWeek ?? null;
  const dues = retail ? (duesWeek ? duesWeek.count : retail.duePolicies) : 0;
  const duesAmount = retail ? (duesWeek ? duesWeek.amount : retail.duePremium) : 0;
  const learningMonthly = learning
    ? {
        credits: learning.learning.creditsInPeriod,
        inProgress: learning.learning.coursesInProgress ?? 0,
        completed: learning.learning.completedInPeriod,
      }
    : null;
  const learningMonthActive =
    learningMonthly !== null &&
    (learningMonthly.credits > 0 || learningMonthly.inProgress > 0 || learningMonthly.completed > 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {leadflow ? (
        <WidgetCard
          title={t('widgetFollowups')}
          value={leadflow.followups.today > 0 ? String(leadflow.followups.today) : null}
          sub={`${leadflow.followups.today} ${t('followupsDue')}`}
          emptyText={t('widgetFollowupsEmpty')}
          accent="orange"
        />
      ) : leadflowStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetFollowups')} accent="orange" />
      ) : (
        <FeedErrorCard title={t('widgetFollowups')} accent="orange" onRetry={onRetryLeadflow} />
      )}
      {retail ? (
        <WidgetCard
          title={t(duesWeek ? 'widgetDues' : 'widgetDuesMonth')}
          value={dues > 0 ? String(dues) : null}
          sub={
            duesWeek
              ? `${t(SCOPE_KEY[retail.scope])} · ${formatWeekRange(duesWeek.weekStart, duesWeek.weekEnd, lang)} · ${dues} ${t('duesThisWeek')} · ${formatBdt(duesAmount)}`
              : `${t(SCOPE_KEY[retail.scope])} · ${dues} ${t('duesThisMonth')} · ${formatBdt(duesAmount)}`
          }
          emptyText={t(duesWeek ? 'widgetDuesEmpty' : 'widgetDuesMonthEmpty')}
          accent="olive"
        />
      ) : retailStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetDues')} accent="olive" />
      ) : (
        <FeedErrorCard title={t('widgetDues')} accent="olive" onRetry={onRetryRetail} />
      )}
      {learning ? (
        <WidgetCard
          title={t('widgetLearningMonth')}
          value={learningMonthActive && learningMonthly ? String(learningMonthly.credits) : null}
          sub={
            learningMonthly
              ? t('learningMonthSub', {
                  inProgress: learningMonthly.inProgress,
                  completed: learningMonthly.completed,
                })
              : ''
          }
          emptyText={t('widgetLearningMonthEmpty')}
          accent="charcoal"
        />
      ) : learningStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetLearningMonth')} accent="charcoal" />
      ) : (
        <FeedErrorCard title={t('widgetLearningMonth')} accent="charcoal" onRetry={onRetryLearning} />
      )}
      {retail ? (
        <WidgetCard
          title={t('widgetBusiness')}
          value={retail.fycp > 0 ? formatBdt(retail.fycp) : null}
          sub={t('businessThisMonth')}
          emptyText={t('widgetBusinessEmpty')}
          accent="orange"
        />
      ) : retailStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetBusiness')} accent="orange" />
      ) : (
        <FeedErrorCard title={t('widgetBusiness')} accent="orange" onRetry={onRetryRetail} />
      )}
    </div>
  );
}

/**
 * Team grid for Team Leads / Managers: the 2-card grid (follow-ups
 * + learning) with the same per-feed states as the own grid. A
 * loaded feed with no team data shows the plain empty text for that
 * card — never a placeholder figure.
 */
function TeamGrid({
  leadflow,
  leadflowStatus,
  onRetryLeadflow,
  learning,
  learningStatus,
  onRetryLearning,
}: {
  leadflow: LeadflowSummary | null;
  leadflowStatus: FeedStatus;
  onRetryLeadflow: () => void;
  learning: LearningSummary | null;
  learningStatus: FeedStatus;
  onRetryLearning: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {leadflow ? (
        <WidgetCard
          title={t('widgetFollowups')}
          value={
            leadflow.team && leadflow.team.followups.today > 0
              ? String(leadflow.team.followups.today)
              : null
          }
          sub={`${leadflow.team?.followups.today ?? 0} ${t('followupsDue')}`}
          emptyText={t('widgetFollowupsEmpty')}
          accent="orange"
        />
      ) : leadflowStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetFollowups')} accent="orange" />
      ) : (
        <FeedErrorCard title={t('widgetFollowups')} accent="orange" onRetry={onRetryLeadflow} />
      )}
      {learning ? (
        <WidgetCard
          title={t('widgetLearning')}
          value={learning.team ? `${learning.team.avgProgress}%` : null}
          sub={t('teamLearningInProgress', { count: learning.team?.learningMembersCount ?? 0 })}
          emptyText={t('widgetLearningEmpty')}
          accent="charcoal"
        />
      ) : learningStatus === 'loading' ? (
        <WidgetSkeleton title={t('widgetLearning')} accent="charcoal" />
      ) : (
        <FeedErrorCard title={t('widgetLearning')} accent="charcoal" onRetry={onRetryLearning} />
      )}
    </div>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const employeeId = user?.employeeId ?? '';

  // Each feed loads independently (cached first, fresh in the
  // background with one retry). Home periods (Mahadi 2026-11-20):
  // retail + learning load with THIS_MONTH_SELECTION (business,
  // FYCP, policy sales and learning are monthly views); LeadFlow
  // loads with ALL_TIME_SELECTION (follow-ups are day-bucketed, so
  // the period does not change them).
  const leadflowFeed = useFeed(loadLeadflowCached, loadLeadflowFresh, token, employeeId, ALL_TIME_SELECTION);
  const learningFeed = useFeed(loadLearningCached, loadLearningFresh, token, employeeId, THIS_MONTH_SELECTION);
  const retailFeed = useFeed(loadRetailCached, loadRetailFresh, token, employeeId, THIS_MONTH_SELECTION);

  // Android app promo (Mahadi 2026-11-21): Android web visitors only,
  // never inside the native app, never after a dismissal (gate in
  // appDownload.ts). The 1.2s delay lets the splash finish first —
  // the splash is gone by 1s at most (700ms minimum + 300ms fade).
  const [showPromo, setShowPromo] = useState(false);
  useEffect(() => {
    if (!shouldShowAndroidPromo()) return;
    const t = window.setTimeout(() => setShowPromo(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  if (!user) return null;

  const leadflow = leadflowFeed.summary;
  const learning = learningFeed.summary;
  const retail = retailFeed.summary;
  const hour = new Date().getHours();

  // The team size shows only once a feed has reported it.
  const teamSize = leadflow?.team?.teamSize ?? learning?.team?.teamSize ?? null;
  const hasTeamRole = user.role === 'team_lead' || user.role === 'manager';

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Greeting — no sentence under the title (Mahadi 2026-11-20). */}
      <section>
        <p className="text-sm font-semibold text-sunset">
          {t(greetingKey(hour))}, {firstName(user.name)}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t('navHome')}
        </h1>
      </section>

      {/* Own widgets — every role. */}
      <WidgetGrid
        leadflow={leadflow}
        leadflowStatus={leadflowFeed.status}
        onRetryLeadflow={leadflowFeed.retry}
        learning={learning}
        learningStatus={learningFeed.status}
        onRetryLearning={learningFeed.retry}
        retail={retail}
        retailStatus={retailFeed.status}
        onRetryRetail={retailFeed.retry}
      />

      {/* Due premiums — own dues. A loaded retail feed shows the
          summary widget (upcoming + overdue due columns above the
          month-to-date totals, or the plain empty text when there
          are none); a loading feed shows a skeleton, a failed fetch
          an error state with retry. */}
      {retail ? (
        <DuePremiumsWidget
          live={{
            duePolicies: retail.duePolicies,
            duePremium: retail.duePremium,
            dueMonth: retail.dueMonth,
            scope: retail.scope,
            dueRowsOverdue: retail.dueRowsOverdue,
            dueRowsUpcoming: retail.dueRowsUpcoming,
          }}
        />
      ) : retailFeed.status === 'loading' ? (
        <section
          aria-label={t('dueWidgetTitle')}
          aria-busy="true"
          className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
        >
          <h3 className="text-base font-bold text-charcoal">{t('dueWidgetTitle')}</h3>
          <div aria-hidden className="mt-3 h-9 w-32 animate-pulse rounded-lg bg-cream-dark/70" />
          <div aria-hidden className="mt-2 h-4 w-48 max-w-full animate-pulse rounded bg-cream-dark/50" />
        </section>
      ) : (
        <section
          aria-label={t('dueWidgetTitle')}
          className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
        >
          <h3 className="text-base font-bold text-charcoal">{t('dueWidgetTitle')}</h3>
          <p className="mt-3 text-base font-medium text-charcoal/70">{t('feedLoadError')}</p>
          <button
            type="button"
            onClick={retailFeed.retry}
            className="mt-3 min-h-10 rounded-xl bg-charcoal px-4 text-sm font-semibold text-white transition-colors hover:bg-charcoal/90"
          >
            {t('feedRetry')}
          </button>
        </section>
      )}

      {/* Sales overview — this-month retail figures (Total policy sales
          + Total FYCP with New / Deferred sub-text), scoped to the
          caller. Shown once the retail feed has loaded; an empty
          retail scope shows no cards at all (same rule as the
          Dashboard's empty state). The scope + period chip stays:
          it tells the user whose data and which month the figures
          are. */}
      {retail && !retail.empty && (
        <section aria-label={t('homeSalesTitle')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-charcoal">{t('homeSalesTitle')}</h2>
            <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
              {t(SCOPE_KEY[retail.scope])} · {t('periodThisMonth')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <WidgetCard
              title={t('homeSalesPolicies')}
              value={fmtCount(retail.policies)}
              sub={t('homeSalesPoliciesSub')}
              emptyText=""
              accent="charcoal"
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
            />
          </div>
        </section>
      )}

      {/* Team section — Team Lead and Manager only. The 2-card grid
          (follow-ups + learning) with per-feed states; team dues
          live in the own grid's scoped retail slice. */}
      {hasTeamRole && (
        <section aria-label={t('teamSectionTitle')}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-bold text-charcoal">{t('teamSectionTitle')}</h2>
            {teamSize !== null && (
              <p className="text-sm text-charcoal/60">
                {teamSize} {t('teamMembers')}
              </p>
            )}
          </div>
          <TeamGrid
            leadflow={leadflow}
            leadflowStatus={leadflowFeed.status}
            onRetryLeadflow={leadflowFeed.retry}
            learning={learning}
            learningStatus={learningFeed.status}
            onRetryLearning={learningFeed.retry}
          />
        </section>
      )}

      {/* Quick actions — one flat grid, icon + name (Mahadi 2026-11-20).
          No group sections: every tool is one tap away, like an app
          launcher. Tapping opens the app same-tab (see QuickActionTile). */}
      <section aria-label={t('modulesTitle')}>
        <h2 className="text-lg font-bold text-charcoal">{t('modulesTitle')}</h2>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-7">
          {MODULES.map((m) => (
            <QuickActionTile key={m.id} module={m} />
          ))}
        </div>
      </section>

      {showPromo && <AndroidAppPromo onDismiss={() => setShowPromo(false)} />}
    </div>
  );
}
