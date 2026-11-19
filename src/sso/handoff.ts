/**
 * Hub → module SSO handoff (same-tab navigation, Mahadi's decision 2026-11-20).
 *
 * Milestone 2 used window.open + postMessage. That is replaced by the
 * fragment flow in the protocol (~/workspace/agent-hub-m2/PROTOCOL.md §3):
 * a joined module tile is a plain same-tab link whose href carries the SSO
 * token in the URL FRAGMENT:
 *
 *   <module-url>#hub-token=<JWT>
 *
 * Why a fragment, and why it is safe:
 * - A fragment is NEVER sent to the server — it cannot land in server
 *   access logs or in a Referer header. A query parameter would, which is
 *   why the token must never travel as `?hub-token=`.
 * - The module strips the fragment immediately on load
 *   (history.replaceState, keeping path + query), so the token does not
 *   linger in the address bar or in the browser history entry.
 * - The token is short-lived (≤ 1 h) and the module verifies the RS256
 *   signature before trusting it — the signature, not the transport, is
 *   the trust anchor.
 *
 * Sign-out limitation (expected, not a failure): same-tab navigation means
 * there is no second window to notify, so the Hub CANNOT broadcast
 * sign-out to a module the agent already navigated to. A module session
 * ends at token expiry (≤ 1 h) — the module re-checks expiry on a 30 s
 * timer and on visibility change. Hub sign-out still clears the Hub's own
 * session immediately.
 *
 * Only modules flagged `ssoJoined: true` in src/data/modules.ts use this.
 * Everything else keeps opening as a plain link (see ModuleTile).
 */
import type { HubModule } from '../data/modules';

/** Fragment prefix the module looks for (protocol §3). */
export const HUB_TOKEN_FRAGMENT_PREFIX = '#hub-token=';

/**
 * Build the URL a joined module tile links to: the module URL with the SSO
 * token in the fragment. Without a token (should not happen — tiles only
 * render signed in) the plain module URL is returned, and the module runs
 * standalone. Any pre-existing fragment on the module URL is dropped —
 * no module URL carries one today, and the token fragment must be the
 * only one the module sees.
 */
export function buildModuleUrl(module: HubModule, token: string | null): string {
  if (!module.url) return '';
  const base = module.url.split('#')[0];
  if (!token) return base;
  return `${base}${HUB_TOKEN_FRAGMENT_PREFIX}${token}`;
}
