import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { ANDROID_APK_URL, isAndroidDevice, isNativeApp, shouldShowAndroidPromo } from '../data/appDownload';
import { AndroidAppPromo } from '../components/AndroidAppPromo';
import { LanguagePill } from '../components/LanguagePill';
import { IconCheck } from '../components/icons';
import type { AuthError } from '../auth/types';

const LEARNING_HUB_URL = 'https://shanta-life-learning-hub.vercel.app';
/**
 * Learning Hub brand assets, live-referenced (same approach as the
 * module tile icons — the apps' own deployed URLs, verified 200 on
 * 2026-11-20). Raster files cannot travel through the Hub's
 * text-only connector push, so they are referenced, not copied. Each
 * <img> falls back to the geometric hub mark on error, so a failed
 * load never leaves an empty slot — and the photo panel has a dark
 * ground behind the image, so the white panel text stays readable
 * even with no photo at all.
 */
const FIELD_PHOTO_URL = `${LEARNING_HUB_URL}/assets/img/field-training-1.jpg`;
const LOGO_WHITE_URL = `${LEARNING_HUB_URL}/assets/img/logo-white.png`;
const LOGO_COLOR_URL = `${LEARNING_HUB_URL}/assets/img/logo-color.png`;

/** The geometric hub mark (same as Layout's Wordmark), sized by prop. */
function HubMark({ size }: { size: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-12 w-12 rounded-xl';
  const ring = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  const dot = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center bg-charcoal ${box}`}>
      <span className={`relative flex items-center justify-center ${ring}`}>
        <span className={`absolute rounded-full bg-sunset ${dot}`} />
        <span className="absolute h-full w-full rounded-full border-olive" style={{ borderWidth: size === 'sm' ? 2 : 3 }} />
      </span>
    </span>
  );
}

/** Shanta Life logo (live) with the hub-mark fallback. */
function ShantaLogo({ variant, className }: { variant: 'white' | 'color'; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <HubMark size={variant === 'white' ? 'md' : 'sm'} />;
  return (
    <img
      src={variant === 'white' ? LOGO_WHITE_URL : LOGO_COLOR_URL}
      alt="Shanta Life"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** Mobile wave band — the Learning Hub splash treatment (same paths). */
function WaveBand() {
  return (
    <svg
      aria-hidden
      data-wave
      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full lg:hidden"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
    >
      <path d="M0,64 C240,110 480,20 720,48 C960,76 1200,110 1440,56 L1440,120 L0,120 Z" fill="#707817" opacity="0.35" />
      <path d="M0,84 C260,120 520,52 780,74 C1040,96 1240,116 1440,84 L1440,120 L0,120 Z" fill="#555D20" opacity="0.9" />
      <path d="M0,102 C280,126 560,84 840,98 C1120,112 1280,120 1440,104 L1440,120 L0,120 Z" fill="#555D20" />
    </svg>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { signIn, sessionExpired } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  // Android app download link (Mahadi 2026-11-21): Android web
  // visitors only — hidden inside the native app, on iOS and on
  // desktop. Evaluated once: the UA / native state cannot change
  // during a page lifetime.
  const [showAndroidLink] = useState(() => isAndroidDevice() && !isNativeApp());

  // Android app promo (Mahadi 2026-11-21): the same popup as Home,
  // shown here too so Android web visitors are asked BEFORE they sign
  // in, not only after. Same gate and same dismissal flag (dismissing
  // here also hides it on Home, and vice versa). The 1.2s delay lets
  // the splash finish first.
  const [showPromo, setShowPromo] = useState(false);
  useEffect(() => {
    if (!shouldShowAndroidPromo()) return;
    const t = window.setTimeout(() => setShowPromo(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

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

  const panelValues = [t('loginPanelValue1'), t('loginPanelValue2'), t('loginPanelValue3')];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-cream">
      {/* Desktop photo panel (Learning Hub pattern): the field photo
          under a lighter overlay than LH's — more of the photo shows
          (Mahadi: background image with increased transparency) — with
          a dark ground behind it so the white text stays readable even
          if the photo fails to load. */}
      <div className="absolute inset-y-0 left-0 hidden w-[46%] bg-charcoal lg:block" aria-hidden="true">
        <img
          src={FIELD_PHOTO_URL}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(60,60,59,0.78) 0%, rgba(60,60,59,0.62) 48%, rgba(151,140,33,0.55) 100%)',
          }}
        />
      </div>
      <div className="absolute inset-y-0 left-0 hidden w-[46%] lg:block">
        <div className="flex h-full flex-col justify-center px-12 text-white xl:px-16">
          <ShantaLogo variant="white" className="h-12 w-auto self-start" />
          <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.3em] text-sunset">
            {t('loginPanelEyebrow')}
          </p>
          <p className="mt-3 max-w-lg text-[2.1rem] font-extrabold leading-snug">
            {t('loginPanelHeadline')}
          </p>
          <ul className="mt-9 max-w-md space-y-3">
            {panelValues.map((title) => (
              <li key={title} className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-olive text-white">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                <span className="text-[14px] font-bold">{title}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <WaveBand />

      <div className="relative flex min-h-dvh w-full flex-col px-4 pb-24 sm:px-6 lg:ml-[46%] lg:w-[54%] lg:px-10 lg:pb-0">
        <header className="flex items-center justify-between gap-3 pt-5">
          <ShantaLogo variant="color" className="h-8 w-auto lg:hidden" />
          <span className="hidden lg:block" aria-hidden="true" />
          <LanguagePill />
        </header>

        <div className="grid flex-1 place-items-center py-10">
          <div className="animate-hub-page w-full max-w-md">
            <div className="overflow-hidden rounded-3xl bg-white shadow-lift">
              <div className="p-6 sm:p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-sunset">
                  {t('loginPanelEyebrow')}
                </p>
                <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-charcoal">
                  {t('loginTitle')}
                </h1>
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
            </div>
          </div>
        </div>

        <footer className="pb-5 text-center text-xs text-charcoal/45">
          {showAndroidLink && (
            <p className="mb-2">
              <a
                href={ANDROID_APK_URL}
                target="_blank"
                rel="noopener"
                data-android-download-link
                className="text-sm font-semibold text-sunset underline-offset-2 hover:underline"
              >
                {t('androidDownloadLink')}
              </a>
            </p>
          )}
          {t('appTagline')}
        </footer>
      </div>

      {showPromo && <AndroidAppPromo onDismiss={() => setShowPromo(false)} />}
    </div>
  );
}
