/**
 * Hub → module SSO handoff (Milestone 2 protocol §3).
 *
 * Only modules flagged `ssoJoined: true` in src/data/modules.ts use this.
 * Everything else keeps opening as a plain link (see ModuleTile).
 *
 * Flow (Hub side):
 * 1. `window.open(url, '_blank')` — WITHOUT `noopener`, so the module can
 *    reach `window.opener` to send `hub-ready`. If it returns null (popup
 *    blocked), fall back to a plain link navigation; the module then runs
 *    standalone.
 * 2. Listen for `{type:'hub-ready', module:'<id>'}`. Accept ONLY when
 *    `event.origin` === the module's origin (from its URL) AND
 *    `event.source` === the opened window.
 * 3. On `hub-ready`, post `{type:'hub-token', token}` with `targetOrigin` =
 *    the module's origin — never `'*'` for the token.
 * 4. Track opened module windows. On Hub sign-out AND on session expiry,
 *    post `{type:'hub-signout'}` to each still-open window (best-effort).
 * 5. If no `hub-ready` arrives within 10 s, stop listening and do nothing
 *    further — a live module without join code simply never sends
 *    `hub-ready`, and that is the graceful standalone path, not an error.
 *
 * The token is NEVER put in a URL, in localStorage, or in any log.
 */
import type { HubModule } from '../data/modules';

const HANDOFF_TIMEOUT_MS = 10_000;

interface TrackedWindow {
  win: Window;
  origin: string;
  moduleId: string;
}

const tracked: TrackedWindow[] = [];

function pruneTracked(): void {
  for (let i = tracked.length - 1; i >= 0; i--) {
    try {
      if (tracked[i].win.closed) tracked.splice(i, 1);
    } catch {
      tracked.splice(i, 1);
    }
  }
}

/**
 * Open a joined module and hand it the SSO token once it signals readiness.
 * Returns the opened window, or null when the popup was blocked (the plain
 * link fallback already ran in that case) or the module has no URL.
 */
export function openModule(module: HubModule, token: string): Window | null {
  if (!module.url) return null;
  const origin = new URL(module.url).origin;

  // Deliberately WITHOUT `noopener`: the module must reach window.opener to
  // send `hub-ready`. The token is only ever posted after the strict
  // origin + source checks below, so the opener link cannot leak it.
  const win = window.open(module.url, '_blank');
  if (!win) {
    // Popup blocked — plain link navigation; the module runs standalone.
    const a = document.createElement('a');
    a.href = module.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return null;
  }

  tracked.push({ win, origin, moduleId: module.id });

  let settled = false;
  let timer: number | undefined;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener('message', onMessage);
    if (timer !== undefined) window.clearTimeout(timer);
  };
  const onMessage = (event: MessageEvent) => {
    // Strict checks: the module's origin AND the exact window we opened.
    if (event.origin !== origin) return;
    if (event.source !== win) return;
    const data = event.data as { type?: unknown; module?: unknown } | null;
    if (!data || data.type !== 'hub-ready' || data.module !== module.id) return;
    try {
      win.postMessage({ type: 'hub-token', token }, origin);
    } catch {
      /* window closed in the meantime — nothing to do */
    }
    cleanup();
  };
  timer = window.setTimeout(() => {
    // No hub-ready in 10 s: the module runs standalone. Silent by design.
    cleanup();
  }, HANDOFF_TIMEOUT_MS);
  window.addEventListener('message', onMessage);
  return win;
}

/**
 * Tell every still-open joined module window that the Hub session ended
 * (sign-out or expiry). Best-effort: closed or unreachable windows are
 * skipped. Called from AuthContext's signOut and session-expiry paths.
 */
export function broadcastHubSignOut(): void {
  pruneTracked();
  for (const entry of tracked) {
    try {
      if (!entry.win.closed) entry.win.postMessage({ type: 'hub-signout' }, entry.origin);
    } catch {
      /* best-effort — a dead window cannot be told anything */
    }
  }
  tracked.length = 0;
}
