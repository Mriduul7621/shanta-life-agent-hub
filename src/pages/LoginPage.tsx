import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth, isDemoAuthEnabled } from '../auth/AuthContext';
import { DEMO_PIN, DEMO_USERS } from '../auth/demoProvider';
import { useI18n } from '../i18n/I18nContext';
import { LanguagePill } from '../components/LanguagePill';
import type { AuthError } from '../auth/types';
import type { DictKey } from '../i18n/dictionary';

function roleKey(role: string): DictKey {
  if (role === 'team_lead') return 'roleTeamLead';
  if (role === 'manager') return 'roleManager';
  if (role === 'admin') return 'roleAdmin';
  return 'roleEmployee';
}

const LEARNING_HUB_URL = 'https://shanta-life-learning-hub.vercel.app';

export function LoginPage() {
  const { t } = useI18n();
  const { signIn, sessionExpired } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  // One identifier field (LH pattern): an email routes to the staff
  // password track, anything else to the PIN track — the server
  // decides; the form only adapts its hints.
  const looksLikeEmail = identifier.includes('@');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signIn(identifier, pin);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  function errorMessage(err: AuthError): string {
    switch (err.code) {
      case 'wrong_pin':
        return err.attemptsLeft === undefined
          ? t('errorWrongPin')
          : `${t('errorWrongPin')} ${err.attemptsLeft} ${t('errorAttemptsLeft')}.`;
      case 'locked':
        return `${t('errorLocked')} ${t('lockedMinutes', { minutes: err.lockedMinutesLeft ?? 15 })}`;
      case 'unknown_user':
        return t('errorUnknownUser');
      case 'not_configured':
        return t('errorNotConfigured');
      case 'session_expired':
        return t('errorSessionExpired');
      case 'no_lms_record':
        return t('errorNoLmsRecord');
      case 'inactive':
        return t('errorInactive');
      case 'must_change':
        return t('errorMustChange');
      case 'unavailable':
        return t('errorUnavailable');
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-charcoal">
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
        <LanguagePill />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-cream-dark bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">{t('loginTitle')}</h1>
            <p className="mt-1 text-sm text-charcoal/60">{t('loginSubtitle')}</p>

            {sessionExpired && (
              <p role="status" className="mt-4 rounded-xl bg-olive/10 px-4 py-3 text-sm font-medium text-charcoal">
                {t('errorSessionExpired')}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="employee-id" className="mb-1.5 block text-sm font-semibold text-charcoal">
                  {t('loginIdentifier')}
                </label>
                <input
                  id="employee-id"
                  name="employee-id"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t('loginIdentifierPlaceholder')}
                  className="min-h-12 w-full rounded-xl border border-cream-dark bg-white px-4 text-base text-charcoal outline-none placeholder:text-charcoal/40 focus:border-sunset focus:ring-2 focus:ring-sunset/30"
                />
              </div>
              <div>
                <label htmlFor="pin" className="mb-1.5 block text-sm font-semibold text-charcoal">
                  {t('pin')}
                </label>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode={looksLikeEmail ? 'text' : 'numeric'}
                  autoComplete="current-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={looksLikeEmail ? t('passwordPlaceholder') : t('pinPlaceholder')}
                  className="min-h-12 w-full rounded-xl border border-cream-dark bg-white px-4 text-base text-charcoal outline-none placeholder:text-charcoal/40 focus:border-sunset focus:ring-2 focus:ring-sunset/30"
                />
                <p className="mt-2 text-right">
                  <a
                    href={`${LEARNING_HUB_URL}/login/forgot`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-sunset underline-offset-2 hover:underline"
                  >
                    {t('forgotCredential')}
                  </a>
                </p>
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  <p>{errorMessage(error)}</p>
                  {error.code === 'must_change' && (
                    <p className="mt-2">
                      <a
                        href={`${LEARNING_HUB_URL}/login`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-sunset underline-offset-2 hover:underline"
                      >
                        {t('changeInLearningHub')} →
                      </a>
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !identifier.trim() || !pin}
                className="min-h-12 w-full rounded-xl bg-sunset text-base font-bold text-white transition-colors hover:bg-sunset-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t('signingIn') : t('signIn')}
              </button>
            </form>
          </div>

          {isDemoAuthEnabled && (
            <section
              aria-label={t('demoNoticeTitle')}
              className="mt-4 rounded-3xl border border-dashed border-olive/50 bg-olive/10 p-5"
            >
              <h2 className="text-sm font-bold text-charcoal">{t('demoNoticeTitle')}</h2>
              <p className="mt-1 text-sm text-charcoal/70">{t('demoNoticeBody')}</p>
              <ul className="mt-3 space-y-2">
                {DEMO_USERS.map((u) => (
                  <li key={u.employeeId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier(u.employeeId);
                        setPin(DEMO_PIN);
                      }}
                      className="font-mono font-bold text-charcoal underline decoration-sunset decoration-2 underline-offset-2"
                    >
                      {u.employeeId}
                    </button>
                    <span className="text-charcoal/70">
                      {t(roleKey(u.role))} · PIN {DEMO_PIN}
                    </span>
                    {u.mustChangeCredential && (
                      <span className="rounded-full bg-sunset/15 px-2 py-0.5 text-xs font-bold text-sunset">
                        {t('demoFirstLoginChange')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-charcoal/55">{t('demoUser')} · {t('appTagline')}</p>
            </section>
          )}
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-charcoal/45">{t('appTagline')}</footer>
    </div>
  );
}
