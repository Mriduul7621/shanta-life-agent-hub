import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { LanguagePill } from '../components/LanguagePill';

/** Forced first-login credential change (Learning Hub pattern). */
export function ForceChangePage() {
  const { t } = useI18n();
  const { user, changeCredential, signOut } = useAuth();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<'invalid' | 'mismatch' | 'same' | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await changeCredential(next, confirm);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <span className="text-base font-bold text-charcoal">
          Shanta Life <span className="text-xs font-semibold tracking-wide text-sunset">AGENT HUB</span>
        </span>
        <LanguagePill />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-cream-dark bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-charcoal">{t('changePinTitle')}</h1>
          <p className="mt-1 text-sm text-charcoal/60">{t('changePinSubtitle')}</p>
          <p className="mt-3 text-sm font-semibold text-charcoal">
            {user?.name} · {user?.employeeId}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="new-pin" className="mb-1.5 block text-sm font-semibold text-charcoal">
                {t('newPin')}
              </label>
              <input
                id="new-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                autoFocus
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="••••••"
                className="min-h-12 w-full rounded-xl border border-cream-dark bg-white px-4 text-base text-charcoal outline-none placeholder:text-charcoal/40 focus:border-sunset focus:ring-2 focus:ring-sunset/30"
              />
            </div>
            <div>
              <label htmlFor="confirm-pin" className="mb-1.5 block text-sm font-semibold text-charcoal">
                {t('confirmPin')}
              </label>
              <input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••"
                className="min-h-12 w-full rounded-xl border border-cream-dark bg-white px-4 text-base text-charcoal outline-none placeholder:text-charcoal/40 focus:border-sunset focus:ring-2 focus:ring-sunset/30"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error === 'invalid' && t('errorPinInvalid')}
                {error === 'mismatch' && t('errorPinMismatch')}
                {error === 'same' && t('errorPinSame')}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !next || !confirm}
              className="min-h-12 w-full rounded-xl bg-sunset text-base font-bold text-white transition-colors hover:bg-sunset-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('changePinButton')}
            </button>
            <button
              type="button"
              onClick={signOut}
              className="min-h-11 w-full rounded-xl text-sm font-semibold text-charcoal/70 hover:bg-cream"
            >
              {t('signOut')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
