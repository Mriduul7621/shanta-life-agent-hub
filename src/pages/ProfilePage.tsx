import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { LanguagePill } from '../components/LanguagePill';
import type { DictKey } from '../i18n/dictionary';

export const APP_VERSION = '0.1.0 (Milestone 1)';

function roleKey(role: string): DictKey {
  if (role === 'team_lead') return 'roleTeamLead';
  if (role === 'manager') return 'roleManager';
  if (role === 'admin') return 'roleAdmin';
  return 'roleEmployee';
}

export function ProfilePage() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">{t('profileTitle')}</h1>

      <section className="rounded-2xl border border-cream-dark bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-charcoal text-lg font-bold text-white"
          >
            {user.name
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-charcoal">{user.name}</p>
            <p className="text-sm text-charcoal/60">{t(roleKey(user.role))}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 border-t border-cream-dark pt-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-charcoal/60">{t('profileName')}</dt>
            <dd className="text-right font-medium text-charcoal">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-charcoal/60">{t('employeeId')}</dt>
            <dd className="font-mono font-medium text-charcoal">{user.employeeId}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-charcoal/60">{t('profileRole')}</dt>
            <dd className="text-right font-medium text-charcoal">{t(roleKey(user.role))}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-charcoal/60">{t('profileVersion')}</dt>
            <dd className="text-right font-medium text-charcoal">{APP_VERSION}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-cream-dark bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-charcoal">{t('profileLanguage')}</h2>
            <p className="text-sm text-charcoal/60">বাংলা / English</p>
          </div>
          <LanguagePill />
        </div>
      </section>

      {user.role === 'admin' && (
        <section
          aria-label={t('consoleTitle')}
          className="rounded-2xl border border-dashed border-cream-dark bg-cream/60 p-5 sm:p-6"
        >
          <h2 className="text-base font-bold text-charcoal">{t('consoleTitle')}</h2>
          <p className="mt-1 text-sm text-charcoal/60">{t('consoleSoon')}</p>
          <button
            type="button"
            disabled
            className="mt-3 min-h-11 cursor-not-allowed rounded-xl bg-charcoal/20 px-5 text-sm font-bold text-charcoal/50"
          >
            {t('consoleTitle')} · {t('comingSoon')}
          </button>
        </section>
      )}

      <button
        type="button"
        onClick={signOut}
        className="min-h-12 w-full rounded-xl border border-red-200 bg-white text-base font-bold text-red-700 transition-colors hover:bg-red-50"
      >
        {t('signOut')}
      </button>
    </div>
  );
}
