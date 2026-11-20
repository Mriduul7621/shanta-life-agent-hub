import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

/**
 * Branded splash screen (Learning Hub pattern) — shown on first load
 * while the session restores, then faded out by App.tsx (minimum
 * ~700ms on screen, 300ms fade, total ≤ ~1s).
 *
 * pointer-events-none ALWAYS: the splash is purely visual and must
 * never block the login form beneath it. The logo is live-referenced
 * from the Learning Hub deployment (same approach as the module tile
 * icons); if it fails to load, the geometric hub mark shows instead,
 * so the splash never renders empty. Motion is transform/opacity
 * only and is neutralised by the reduced-motion rule in index.css.
 */
const LOGO_COLOR_URL = 'https://shanta-life-learning-hub.vercel.app/assets/img/logo-color.png';

/** The geometric hub mark (same as Layout's Wordmark), large. */
function HubMark() {
  return (
    <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-3xl bg-charcoal">
      <span className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute h-5 w-5 rounded-full bg-sunset" />
        <span className="absolute h-full w-full rounded-full border-4 border-olive" />
      </span>
    </span>
  );
}

export function SplashScreen({ fading }: { fading: boolean }) {
  const { t } = useI18n();
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <div
      data-splash
      role="status"
      aria-label={t('splashLoading')}
      className={`pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream splash-fade ${
        fading ? 'splash-fade-out' : ''
      }`}
    >
      <div className="animate-hub-splash-pop flex flex-col items-center">
        {logoFailed ? (
          <HubMark />
        ) : (
          <img
            src={LOGO_COLOR_URL}
            alt=""
            aria-hidden
            className="h-20 w-auto"
            onError={() => setLogoFailed(true)}
          />
        )}
        <p className="mt-5 text-2xl font-bold tracking-tight text-charcoal">Shanta Life</p>
        <p className="mt-0.5 text-sm font-bold tracking-[0.3em] text-sunset">AGENT HUB</p>
      </div>
      {/* Indeterminate loading bar (LH splash-bar). */}
      <div aria-hidden className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-cream-dark">
        <div className="animate-hub-splash-bar h-full w-1/3 rounded-full bg-sunset" />
      </div>
      <p className="sr-only">{t('splashLoading')}</p>
    </div>
  );
}
