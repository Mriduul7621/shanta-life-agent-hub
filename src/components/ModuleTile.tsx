import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { buildModuleUrl } from '../sso/handoff';
import type { HubModule } from '../data/modules';

const MARK_BG: Record<HubModule['accent'], string> = {
  orange: 'bg-sunset text-white',
  olive: 'bg-olive text-white',
  charcoal: 'bg-charcoal text-white',
};

/**
 * One tool tile. Every enabled tile is a plain same-tab link (Mahadi's
 * decision 2026-11-20 — same tab over new tab and over iframe).
 * - Joined modules (ssoJoined: true) link to the module URL with the SSO
 *   token in the fragment (src/sso/handoff.ts); the module strips it on
 *   load. Without a token the tile still links, and the module runs
 *   standalone.
 * - Everything else enabled is a plain link to the module URL.
 * - Disabled tiles are inert, greyed, and say why.
 */
export function ModuleTile({ module }: { module: HubModule }) {
  const { t } = useI18n();
  const { token } = useAuth();
  const disabled = !module.url;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wide ${MARK_BG[module.accent]} ${disabled ? 'opacity-50' : ''}`}
        >
          {module.mark}
        </span>
        {!disabled && (
          <span className="rounded-full border border-cream-dark px-2.5 py-1 text-xs font-semibold text-charcoal/70">
            {t('openTool')} →
          </span>
        )}
      </div>
      <h3 className="mt-3 text-base font-bold text-charcoal">{module.name}</h3>
      <p className="mt-1 text-sm leading-snug text-charcoal/60">{t(module.descKey)}</p>
      {disabled && module.disabledReasonKey ? (
        <p className="mt-3 inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-charcoal/70">
          {t('comingSoon')} · {t(module.disabledReasonKey)}
        </p>
      ) : (
        <p className="mt-3 text-xs text-charcoal/45">{t('opensInThisTab')}</p>
      )}
    </>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="rounded-2xl border border-dashed border-cream-dark bg-cream/60 p-4 sm:p-5"
      >
        {inner}
      </div>
    );
  }

  const href = module.ssoJoined ? buildModuleUrl(module, token) : module.url;
  return (
    <a
      href={href ?? undefined}
      className="block rounded-2xl border border-cream-dark bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunset sm:p-5"
    >
      {inner}
    </a>
  );
}
