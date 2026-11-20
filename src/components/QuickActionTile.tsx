import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { buildModuleUrl } from '../sso/handoff';
import { prefetchModule } from '../performance/prefetch';
import { ModuleIcon } from './ModuleIcon';
import type { HubModule } from '../data/modules';

/**
 * Compact app-launcher tile for the Home quick-actions grid (Mahadi
 * 2026-11-20): just the app icon + name, no description. Tapping opens
 * the app same-tab with the same SSO behaviour as ModuleTile — joined
 * modules carry the token in the fragment, the rest are plain links.
 * Hover / focus / touch prefetches the app's document (instant-open).
 * Disabled tiles (Proposals) are inert, greyed, and say "Coming soon".
 *
 * The name stays an <h3> inside the link, exactly like ModuleTile, so
 * the QA tile checks (wiring, icons, handoff) keep finding Home tiles
 * the same way. ModuleTile is kept for the module pages (Calculators,
 * Proposals) and the Dashboard's "Open the full dashboard" section.
 */
export function QuickActionTile({ module }: { module: HubModule }) {
  const { t } = useI18n();
  const { token } = useAuth();
  const disabled = !module.url;
  const warm = () => prefetchModule(module.url);

  const inner = (
    <>
      <ModuleIcon module={module} className={`h-12 w-12 ${disabled ? 'opacity-50' : ''}`} />
      <h3
        className={`mt-2 text-center text-sm font-bold leading-tight text-charcoal ${disabled ? 'opacity-50' : ''}`}
      >
        {module.name}
      </h3>
      {disabled && (
        <p className="mt-1.5 rounded-full bg-cream px-2 py-0.5 text-center text-[11px] font-semibold text-charcoal/70">
          {t('comingSoon')}
        </p>
      )}
    </>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="flex flex-col items-center rounded-2xl border border-dashed border-cream-dark bg-cream/60 p-3 sm:p-4"
      >
        {inner}
      </div>
    );
  }

  const href = module.ssoJoined ? buildModuleUrl(module, token) : module.url;
  return (
    <a
      href={href ?? undefined}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      className="flex flex-col items-center rounded-2xl border border-cream-dark bg-white p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunset sm:p-4"
    >
      {inner}
    </a>
  );
}
