/**
 * Android app download popup (Mahadi 2026-11-21) — shown on Home to
 * Android web visitors who have not dismissed it (see
 * src/data/appDownload.ts for the gate). Never rendered inside the
 * native app, on iOS, or on desktop.
 *
 * Minimal by design: title, one line, a Download button (plain link
 * to the public rolling-release APK — Android Chrome downloads it
 * directly) and a close control. Tapping Download also dismisses
 * the popup, so it never reappears after a download.
 *
 * Layout: bottom sheet on phones, centred card from sm up. The card
 * is max-w-sm with p-4 page padding, so it cannot overflow a 360px
 * viewport. The overlay is a plain fixed layer — no page-title
 * sentence anywhere (standing rule).
 */
import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { ANDROID_APK_URL, dismissAndroidPromo } from '../data/appDownload';

export function AndroidAppPromo({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n();

  const dismiss = () => {
    dismissAndroidPromo();
    onDismiss();
  };

  // Escape closes the popup (keyboard / desktop parity).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-android-promo
      role="dialog"
      aria-modal="true"
      aria-label={t('androidPromoTitle')}
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      {/* Backdrop — tapping it dismisses. */}
      <button
        type="button"
        aria-label={t('androidPromoClose')}
        data-android-promo-backdrop
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-charcoal/50"
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift">
        <button
          type="button"
          aria-label={t('androidPromoClose')}
          data-android-promo-close
          onClick={dismiss}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-xl leading-none text-charcoal/60 transition-colors hover:bg-cream hover:text-charcoal"
        >
          ×
        </button>
        <h2 className="pr-8 text-lg font-bold text-charcoal">{t('androidPromoTitle')}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-charcoal/70">{t('androidPromoBody')}</p>
        <a
          href={ANDROID_APK_URL}
          target="_blank"
          rel="noopener"
          data-android-promo-download
          onClick={dismiss}
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-sunset px-4 text-base font-bold text-white transition-colors hover:bg-sunset-dark"
        >
          {t('androidPromoDownload')}
        </a>
        <button
          type="button"
          data-android-promo-notnow
          onClick={dismiss}
          className="mt-2 min-h-10 w-full rounded-xl text-sm font-semibold text-charcoal/60 transition-colors hover:text-charcoal"
        >
          {t('androidPromoNotNow')}
        </button>
      </div>
    </div>
  );
}
