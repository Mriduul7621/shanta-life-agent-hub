import { useState } from 'react';
import type { HubModule } from '../data/modules';

const MARK_BG: Record<HubModule['accent'], string> = {
  orange: 'bg-sunset text-white',
  olive: 'bg-olive text-white',
  charcoal: 'bg-charcoal text-white',
};

/**
 * A module's icon, shared by ModuleTile and QuickActionTile so both render
 * the same icon with the same fallback: the live `iconUrl` first, then the
 * local `icon` copy, then the monogram. If the icon fails to load (the app
 * is down, the URL moved), onError falls back to the monogram — a tile
 * never shows a broken image.
 */
export function ModuleIcon({ module, className }: { module: HubModule; className: string }) {
  const [iconFailed, setIconFailed] = useState(false);
  const iconSrc = module.iconUrl ?? module.icon;
  if (iconSrc && !iconFailed) {
    return (
      <img
        src={iconSrc}
        alt=""
        aria-hidden
        onError={() => setIconFailed(true)}
        className={`shrink-0 rounded-xl object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wide ${MARK_BG[module.accent]} ${className}`}
    >
      {module.mark}
    </span>
  );
}
