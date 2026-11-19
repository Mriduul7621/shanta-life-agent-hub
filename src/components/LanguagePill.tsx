import { useI18n } from '../i18n/I18nContext';

/** EN | BN segmented pill — the one language switcher, used in the header and on Profile. English is primary (Mahadi 2026-11-20). */
export function LanguagePill() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      className="inline-flex items-center rounded-full border border-cream-dark bg-white p-0.5"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-semibold transition-colors ${
          lang === 'en' ? 'bg-sunset text-white' : 'text-charcoal hover:bg-cream'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('bn')}
        aria-pressed={lang === 'bn'}
        className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-semibold transition-colors ${
          lang === 'bn' ? 'bg-sunset text-white' : 'text-charcoal hover:bg-cream'
        }`}
      >
        BN
      </button>
    </div>
  );
}
