import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for the Agent Hub Android app.
 *
 * Architecture (Phase 1 audit, approved by Mahadi 2026-11-20):
 *
 * - REMOTE-LOAD: the shell loads the live production Hub in its WebView
 *   (`server.url`). The web layer ships several times a day, so bundling
 *   `dist/` into the APK would force an APK release for every UI fix and
 *   recreate the version-fragmentation problem the PDR exists to remove.
 *   Remote-load also needs zero code changes: the client calls `/api/*`
 *   relative same-origin and the API sends no CORS headers, so a bundled
 *   app (origin https://localhost) could not reach its own backend at all.
 *   `webDir` therefore holds only the minimal local error page
 *   (`android-web/`), shown when the remote load fails — never a copy of
 *   the app. `server.url` MUST be the production URL, never the preview.
 *
 * - `server.androidScheme: 'https'` is BLOCKING: token verification uses
 *   `crypto.subtle`, which is undefined outside a secure context. A
 *   non-HTTPS scheme would break sign-in on every launch.
 *
 * - Modules open IN-APP: `server.allowNavigation` lists exactly the six
 *   module origins (bare hostnames — Capacitor's HostMask matches them
 *   exactly). Never a wildcard (`*.vercel.app` would trust any Vercel
 *   deployment). The joined calculators' "← Back to Hub" header only
 *   works in-app; in a system browser it would strand the user in Chrome.
 *
 * - `server.errorPath` is the built-in no-connection screen: on a
 *   main-frame load error Capacitor loads this local page (served from
 *   the synced `webDir` at https://localhost/) instead of a blank
 *   WebView. The page's Retry is a full navigation to the live URL,
 *   which also clears any stale deployment the WebView was pinned to.
 *
 * - Back button: the @capacitor/app plugin walks WebView history natively
 *   when no JS listener is registered (i.e. inside a module page — the
 *   bridge clears listeners on every navigation), and the Hub web app
 *   registers a listener (src/native/backButton.ts) that exits only at
 *   the Hub root. Back never closes the app on first press.
 */
const config: CapacitorConfig = {
  appId: 'com.shantalife.agenthub',
  appName: 'Agent Hub',
  webDir: 'android-web',
  android: {
    allowMixedContent: false,
    backgroundColor: '#F7F5F0',
  },
  server: {
    url: 'https://shanta-life-agent-hub.vercel.app',
    androidScheme: 'https',
    errorPath: 'index.html',
    allowNavigation: [
      'lead-flow-jet.vercel.app',
      'shanta-life-learning-hub.vercel.app',
      'premium-illustrator.vercel.app',
      'sdpp-value-projection.vercel.app',
      'incomecalculator-delta.vercel.app',
      'retail-dashboard-zeta.vercel.app',
    ],
  },
};

export default config;
