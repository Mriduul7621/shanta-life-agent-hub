import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Build-target guard (Milestone 2).
 *
 * HUB_BUILD_TARGET is dev | qa | production, DEFAULT production. It is a
 * build-time variable (NOT VITE_-prefixed, so it is never inlined into the
 * client bundle). Set it in the shell or in `.env`:
 * - dev: local development — demo auth and local signing allowed.
 * - qa: QA builds — demo auth and local signing allowed (`npm run qa`
 *   forces HUB_BUILD_TARGET=qa itself).
 * - production: a production-target build FAILS FAST if VITE_DEMO_AUTH=true
 *   or any VITE_JWT_* signing variable is set, because demo users and
 *   signing keys must never ship in a production bundle.
 *
 * The guard runs for `vite build` only — the dev server is local-only by
 * definition. It reads the merged environment the same way Vite does:
 * real shell variables take precedence over `.env` files.
 */
type BuildTarget = 'dev' | 'qa' | 'production';

function resolveBuildTarget(mode: string): BuildTarget {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = process.env.HUB_BUILD_TARGET ?? env.HUB_BUILD_TARGET ?? 'production';
  if (raw !== 'dev' && raw !== 'qa' && raw !== 'production') {
    throw new Error(
      `Agent Hub build guard: HUB_BUILD_TARGET must be "dev", "qa" or "production" (got ${JSON.stringify(raw)}).`,
    );
  }
  return raw;
}

function assertProductionSafe(mode: string, target: BuildTarget): void {
  if (target !== 'production') return;
  const env = loadEnv(mode, process.cwd(), '');
  const merged: Record<string, string | undefined> = { ...env, ...process.env };
  if (merged.VITE_DEMO_AUTH === 'true') {
    throw new Error(
      'Agent Hub build guard: refusing a production-target build with VITE_DEMO_AUTH=true.\n' +
        'Demo auth must never ship in a production build. Set HUB_BUILD_TARGET=dev (local dev) ' +
        'or HUB_BUILD_TARGET=qa (QA) for builds that need demo users.',
    );
  }
  const signingVars = Object.keys(merged).filter(
    (k) => k.startsWith('VITE_JWT_') && merged[k] !== undefined && merged[k] !== '',
  );
  if (signingVars.length > 0) {
    throw new Error(
      `Agent Hub build guard: refusing a production-target build with signing variable(s) set: ${signingVars.join(', ')}.\n` +
        'Production tokens are issued server-side; no signing key may be inlined in a production bundle. ' +
        'Set HUB_BUILD_TARGET=dev or HUB_BUILD_TARGET=qa for builds that sign demo tokens locally.',
    );
  }
}

export default defineConfig(({ command, mode }) => {
  const target = resolveBuildTarget(mode);
  if (command === 'build') {
    assertProductionSafe(mode, target);
    console.log(
      `[agent-hub] build target: ${target}` +
        (target === 'production' ? ' (demo auth OFF, no signing keys)' : ' (demo auth + local signing allowed)'),
    );
  }
  return {
    // Relative base: the app must also run from file:// (local QA) and from a
    // Capacitor webview later, where absolute /asset paths break.
    base: './',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      port: 4173,
      host: true,
    },
  };
});
