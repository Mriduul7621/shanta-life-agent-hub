/**
 * Intent-based prefetch for the instant-open standard (Mahadi 2026-11-20:
 * opening an app from the Hub must feel instant like a normal app — click
 * -> direct open, no long loads).
 *
 * Mechanism: on hover / focus / touchstart of a module tile, the Hub
 * prefetches that app's document (`<link rel="prefetch" as="document">`)
 * so the same-tab navigation hits a warm cache. The preconnects in
 * index.html warm the TLS connections on Hub load; this warms the
 * document itself on intent. PREFETCH ONLY — no prerender: these are
 * auth'd apps, and prerendering would load them signed-out and cause
 * auth flips when the real navigation happens.
 *
 * Rules:
 * - Once per URL per session (a Set) — repeated hovers cost nothing.
 * - The SSO token fragment is stripped before prefetching: fragments are
 *   never sent to the server and the cache key ignores them, so prefetch
 *   the base document. No token ever leaves the Hub in a prefetch.
 * - Respects data-saver (`navigator.connection.saveData`).
 * - Prefetch targets the navigation part only; slow data loading inside
 *   an app (e.g. Retail's 5–8s "Loading sales data…") needs a per-app fix.
 */
const prefetched = new Set<string>();

export function prefetchModule(url: string | null | undefined): void {
  if (!url) return;
  try {
    const base = url.split('#')[0];
    if (!base || prefetched.has(base)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    prefetched.add(base);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = base;
    document.head.appendChild(link);
  } catch {
    // Prefetch is a best-effort optimisation — it must never break the tile.
  }
}
