import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { WidgetData } from '../data/demoData';
import { GROUP_ORDER, GROUP_TITLE_KEY, MODULES } from '../data/modules';
import { WidgetCard } from '../components/WidgetCard';
import { ModuleTile } from '../components/ModuleTile';
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
        </section>
      )}

      {/* Module grid, grouped */}
      <section aria-label={t('modulesTitle')}>
        <h2 className="text-lg font-bold text-charcoal">{t('modulesTitle')}</h2>
        <p className="mt-1 text-sm text-charcoal/60">{t('modulesSubtitle')}</p>
        <div className="mt-4 space-y-6">
          {GROUP_ORDER.map((group) => {
            const tiles = MODULES.filter((m) => m.group === group);
            if (tiles.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-charcoal/55">
                  {t(GROUP_TITLE_KEY[group])}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                  {tiles.map((m) => (
                    <ModuleTile key={m.id} module={m} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
