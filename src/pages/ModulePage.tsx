import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { DEMO_DASHBOARDS, formatBdt } from '../data/demoData';
import type { RoleDashboard, WidgetData } from '../data/demoData';
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
 * Summary strip shell: title + DEMO badge + the note that live data
 * arrives with the app connection in a later milestone. The figures are
 * DEMO (same demoData.ts source as the Home widgets) — never presented
 * as live, and never a fake live connection.
 */
function SummaryCard({ demoNoteKey, children }: { demoNoteKey: DictKey; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('moduleSummaryTitle')}
      className="rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-charcoal">{t('moduleSummaryTitle')}</h2>
        <span className="rounded-full bg-sunset/15 px-2.5 py-1 text-xs font-bold text-sunset-dark">
          {t('demoBadge')}
        </span>
      </div>
      <p className="mt-1 text-sm text-charcoal/60">{t(demoNoteKey)}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Leads summary: follow-ups due + dues this week, own then team. */
function LeadsSummary({ dashboard }: { dashboard: RoleDashboard }) {
  const { t } = useI18n();
  const stats = (data: WidgetData) => (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatBlock label={t('widgetFollowups')} value={String(data.followups)} sub={t('followupsDue')} />
      <StatBlock
        label={t('widgetDues')}
        value={String(data.dues)}
        sub={`${t('duesThisWeek')} · ${formatBdt(data.duesAmountBdt)}`}
      />
    </div>
  );
  return (
    <>
      {stats(dashboard.own)}
      {dashboard.team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          {stats(dashboard.team)}
        </div>
      )}
    </>
  );
}

/** Learning summary: progress % + current course, own then team. */
function LearningSummary({ dashboard }: { dashboard: RoleDashboard }) {
  const { t } = useI18n();
  const own = dashboard.own;
  const team = dashboard.team;
  return (
    <>
      {own.learningCourse ? (
        <StatBlock
          label={t('widgetLearning')}
          value={`${own.learningProgressPct}%`}
          sub={own.learningCourse}
        />
      ) : (
        <p className="text-base font-medium text-charcoal/70">{t('widgetLearningEmpty')}</p>
      )}
      {team && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">{t('teamSectionTitle')}</h3>
          <StatBlock
            label={t('widgetLearning')}
            value={`${team.learningProgressPct}%`}
            sub={t('teamLearningInProgress', { count: team.learningMembersCount ?? 0 })}
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
  const { user } = useAuth();
  const group = VIEW_TO_GROUP[view];
  if (!group) return null;
  const tiles = MODULES.filter((m) => m.group === group);
  const introKey = INTRO_KEY[group];
  const dashboard = user ? DEMO_DASHBOARDS[user.role] : null;

  // Leads and Learning are data pages (Mahadi 2026-11-20): a DEMO summary
  // strip + a Go button. Calculators and Proposals stay tiles-only — they
  // are tools, not data pages.
  const dataGroup = group === 'leads' || group === 'learning';
  const goModule =
    group === 'leads'
      ? MODULES.find((m) => m.id === 'leadflow')
      : group === 'learning'
        ? MODULES.find((m) => m.id === 'learning-hub')
        : undefined;

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
          <SummaryCard demoNoteKey={group === 'leads' ? 'leadsDemoNote' : 'learningDemoNote'}>
            {group === 'leads' ? (
              <LeadsSummary dashboard={dashboard} />
            ) : (
              <LearningSummary dashboard={dashboard} />
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
