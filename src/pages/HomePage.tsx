import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { WidgetData } from '../data/demoData';
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

function WidgetGrid({ data }: { data: WidgetData }) {
  const { t } = useI18n();
  const learningActive = data.learningCourse !== null || data.learningMembersCount != null;
  const learningSub =
    data.learningMembersCount != null
      ? t('teamLearningInProgress', { count: data.learningMembersCount })
      : (data.learningCourse ?? '');
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <WidgetCard
        title={t('widgetFollowups')}
        value={data.followups > 0 ? String(data.followups) : null}
        sub={`${data.followups} ${t('followupsDue')}`}
        emptyText={t('widgetFollowupsEmpty')}
        accent="orange"
        icon={<IconPhone />}
      />
      <WidgetCard
        title={t('widgetDues')}
        value={data.dues > 0 ? String(data.dues) : null}
        sub={`${data.dues} ${t('duesThisWeek')} · ${formatBdt(data.duesAmountBdt)}`}
        emptyText={t('widgetDuesEmpty')}
        accent="olive"
        icon={<IconCoin />}
      />
      <WidgetCard
        title={t('widgetLearning')}
        value={learningActive ? `${data.learningProgressPct}%` : null}
        sub={learningSub}
        emptyText={t('widgetLearningEmpty')}
        accent="charcoal"
        icon={<IconLearning />}
      />
      <WidgetCard
        title={t('widgetBusiness')}
        value={data.businessFycpBdt > 0 ? formatBdt(data.businessFycpBdt) : null}
        sub={t('businessThisMonth')}
        emptyText={t('widgetBusinessEmpty')}
        accent="orange"
        icon={<IconCheck />}
      />
    </div>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user) return null;

  const dashboard = DEMO_DASHBOARDS[user.role];
  const hour = new Date().getHours();

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
          {t('homeSubtitle')} {t('demoRoleNote')}
        </p>
      </section>

      {/* Own widgets — every role */}
      <WidgetGrid data={dashboard.own} />

      {/* Due premiums — own dues (demo data, see DuePremiumsWidget) */}
      <DuePremiumsWidget data={dashboard.own} />

      {/* Team section — Team Lead and Manager only */}
      {dashboard.team && (
        <section aria-label={t('teamSectionTitle')}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-bold text-charcoal">{t('teamSectionTitle')}</h2>
            <p className="text-sm text-charcoal/60">
              {dashboard.teamSize} {t('teamMembers')}
            </p>
          </div>
          <p className="mb-3 text-sm text-charcoal/60">{t('teamSectionSubtitle')}</p>
          <WidgetGrid data={dashboard.team} />
          <div className="mt-3 sm:mt-4">
            <DuePremiumsWidget data={dashboard.team} />
          </div>
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
