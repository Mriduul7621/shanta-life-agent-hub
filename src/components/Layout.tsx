import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { LanguagePill } from './LanguagePill';
import {
  IconCalculator,
  IconDashboard,
  IconHome,
  IconLearning,
  IconLeads,
  IconProfile,
  IconProposals,
} from './icons';
import type { DictKey } from '../i18n/dictionary';

export type View = 'home' | 'leads' | 'learning' | 'calculators' | 'dashboard' | 'proposals' | 'profile';

interface NavItem {
  view: View;
  labelKey: DictKey;
  icon: ReactNode;
  /** Shown in the mobile bottom nav (5 items max). */
  mobile: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'home', labelKey: 'navHome', icon: <IconHome />, mobile: true },
  { view: 'leads', labelKey: 'navLeads', icon: <IconLeads />, mobile: true },
  { view: 'learning', labelKey: 'navLearning', icon: <IconLearning />, mobile: true },
  { view: 'calculators', labelKey: 'navCalculators', icon: <IconCalculator />, mobile: true },
  { view: 'dashboard', labelKey: 'navDashboard', icon: <IconDashboard />, mobile: false },
  { view: 'proposals', labelKey: 'navProposals', icon: <IconProposals />, mobile: false },
  { view: 'profile', labelKey: 'navProfile', icon: <IconProfile />, mobile: true },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      {/* Geometric hub mark — NOT the Shanta Life logo (see README follow-ups). */}
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-charcoal">
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="absolute h-2.5 w-2.5 rounded-full bg-sunset" />
          <span className="absolute h-full w-full rounded-full border-2 border-olive" />
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-charcoal">Shanta Life</span>
        <span className="block text-xs font-semibold tracking-wide text-sunset">AGENT HUB</span>
      </span>
    </div>
  );
}

interface LayoutProps {
  view: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

export function Layout({ view, onNavigate, children }: LayoutProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const mobileItems = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <div className="min-h-dvh bg-cream text-charcoal">
      {/* Desktop left sidebar (lg+) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-cream-dark bg-white lg:flex">
        <div className="border-b border-cream-dark px-5 py-4">
          <Wordmark />
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium transition-colors ${
                view === item.view
                  ? 'bg-charcoal text-white'
                  : 'text-charcoal/75 hover:bg-cream hover:text-charcoal'
              }`}
            >
              <span className={view === item.view ? 'text-sunset' : 'text-charcoal/50'}>{item.icon}</span>
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        <div className="border-t border-cream-dark px-5 py-4">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="text-xs text-charcoal/55">
            {user?.employeeId} · {user ? t(`role${capitalize(user.role)}` as DictKey) : ''}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar: wordmark on phone/tablet, language pill everywhere */}
        <header className="sticky top-0 z-20 border-b border-cream-dark bg-cream/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <p className="hidden text-lg font-bold lg:block">{t(pageTitleKey(view))}</p>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full bg-olive/15 px-2.5 py-1 text-xs font-bold text-olive sm:inline-block">
                {t('demoDataBadge')}
              </span>
              <LanguagePill />
            </div>
          </div>
        </header>

        {/* Content: bottom padding clears the fixed mobile bottom nav */}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile + tablet bottom nav (< lg) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-dark bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {mobileItems.map((item) => {
            const active = view === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigate(item.view)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold leading-tight ${
                  active ? 'text-sunset' : 'text-charcoal/55 hover:text-charcoal'
                }`}
              >
                <span className="flex h-6 items-center justify-center">{item.icon}</span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
                {active && <span aria-hidden className="h-1 w-6 rounded-full bg-sunset" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function capitalize(role: string): string {
  if (role === 'team_lead') return 'TeamLead';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function pageTitleKey(view: View): DictKey {
  switch (view) {
    case 'home':
      return 'navHome';
    case 'leads':
      return 'navLeads';
    case 'learning':
      return 'navLearning';
    case 'calculators':
      return 'navCalculators';
    case 'dashboard':
      return 'navDashboard';
    case 'proposals':
      return 'navProposals';
    case 'profile':
      return 'navProfile';
  }
}
