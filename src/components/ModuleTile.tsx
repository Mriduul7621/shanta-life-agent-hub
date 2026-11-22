import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { buildModuleUrl } from '../sso/handoff';
import { prefetchModule } from '../performance/prefetch';
import { ModuleIcon } from './ModuleIcon';
import type { HubModule } from '../data/modules';

/**
 * One tool tile. Every enabled tile is a plain same-tab link (Mahadi's
 * decision 2026-11-20 — same tab over new tab and over iframe).
 * - Joined modules (ssoJoined: true) link to the module URL with the SSO
 *   token in the fragment (src/sso/handoff.ts); the module strips it on
 *   load. Without a token the tile still links, and the module runs
 *   standalone.
 * - Everything else enabled is a plain link to the module URL.
 * - Disabled tiles are inert, greyed, and say why.
 * - The tile shows the app's real icon: live `iconUrl` first, then the
 *   local `icon` copy, then the monogram. If the icon fails to load (the
 *   app is down, the URL moved), onError falls back to the monogram —
 *   a tile never shows a broken image.
 */
export function ModuleTile({ module }: { module: HubModule }) {
  const { t } = useI18n();
  const { token } = useAuth();
  const disabled = !module.url;

  // hb09: horizontal row (board phones 7 + 8) — icon left, name +
  // desc + "Opens in this tab" middle, sunset "Open →" right. The
  // disabled tile keeps the same row and puts its chip BELOW it.
  const inner = (
    <div className="flex items-center gap-3">
      <ModuleIcon module={module} className={`h-11 w-11 ${disabled ? 'opacity-50' : ''}`} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-charcoal">{module.name}</h3>
        <p className="mt-0.5 text-sm leading-snug text-charcoal/60">{t(module.descKey)}</p>
        {!disabled && <p className="mt-1 text-xs text-charcoal/45">{t('opensInThisTab')}</p>}
      </div>
      {!disabled && (
        <span className="shrink-0 text-sm font-bold whitespace-nowrap text-sunset">
          {t('openTool')} →
        </span>
      )}
    </div>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="rounded-2xl border border-dashed border-cream-dark bg-cream/60 p-4 sm:p-5"
      >
        {inner}
        {module.disabledReasonKey && (
          <p className="mt-3 inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-charcoal/70">
            {t('comingSoon')} · {t(module.disabledReasonKey)}
          </p>
        )}
      </div>
    );
  }

  const href = module.ssoJoined ? buildModuleUrl(module, token) : module.url;
  // Intent-based prefetch (instant-open): hover / focus / touch warms the
  // module's document cache before the click. The base URL is prefetched
  // (no token fragment — prefetchModule strips it); the link itself is
  // unchanged, still same-tab.
  const warm = () => prefetchModule(module.url);
  return (
    <a
      href={href ?? undefined}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      className="block rounded-2xl border border-cream-dark bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sunset sm:p-5"
    >
      {inner}
    </a>
  );
}
