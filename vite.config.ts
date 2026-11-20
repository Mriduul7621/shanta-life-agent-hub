import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Build-target guard (Milestone 2).
 *
 * HUB_BUILD_TARGET is dev | qa | production, DEFAULT production. It is a
 * build-time variable (NOT VITE_-prefixed, so it is never inlined into the
 * client bundle). Set it in the shell or in `.env`:
 * - dev: local development — local signing allowed (QA harness).
 * - qa: QA builds — local signing allowed (`npm run qa` forces
 *   HUB_BUILD_TARGET=qa itself).
 * - production: a production-target build FAILS FAST if any VITE_JWT_*
 *   signing variable is set — signing keys must never ship in a
 *   production bundle. (The demo-auth and demo-fixture checks that
 *   used to live here were removed with the demo itself, Mahadi
 *   2026-11-20: there is no demo auth and no demo slice any more.)
 *   It ALSO fails when a production signing key (HUB_JWT_PRIVATE_KEY_B64)
 *   is present without its matching public-key config
 *   (HUB_PUBLIC_KEY_PEM + HUB_KID), or when the configured HUB_KID does
 *   not match the public key — otherwise the issuer would sign with a
 *   key nothing verifies against and every real sign-in would fail.
 *
 * The guard runs for `vite build` only — the dev server is local-only by
 * definition. It reads the merged environment the same way Vite does:
 * real shell variables take precedence over `.env` files.
 *
 * Two layers: this build guard cannot see Vercel RUNTIME env, so the
 * second layer lives in the issuer itself — api/_lib/signJwt.js refuses
 * to sign when HUB_BUILD_TARGET=production and no
 * HUB_JWT_PRIVATE_KEY_B64 is set (the dev key must never issue real
 * tokens in production). See docs/SSO_PRODUCTION.md.
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
  const signingVars = Object.keys(merged).filter(
    (k) => k.startsWith('VITE_JWT_') && merged[k] !== undefined && merged[k] !== '',
  );
  if (signingVars.length > 0) {
    throw new Error(
      `Agent Hub build guard: refusing a production-target build with signing variable(s) set: ${signingVars.join(', ')}.\n` +
        'Production tokens are issued server-side; no signing key may be inlined in a production bundle. ' +
        'Set HUB_BUILD_TARGET=dev or HUB_BUILD_TARGET=qa for builds that sign test tokens locally.',
    );
  }
  // A production signing key without its matching public-key config
  // means the issuer signs with a key nothing verifies against (the
  // proxies fall back to the dev key) — every real sign-in would fail.
  // HUB_JWT_PRIVATE_KEY_B64 is a runtime secret, but Vercel exposes env
  // vars at build time too, so the pair can be checked here.
  const hasProdSigningKey = merged.HUB_JWT_PRIVATE_KEY_B64 !== undefined && merged.HUB_JWT_PRIVATE_KEY_B64 !== '';
  const prodPem = merged.HUB_PUBLIC_KEY_PEM;
  const prodKid = merged.HUB_KID;
  if (hasProdSigningKey && (!prodPem || !prodKid)) {
    throw new Error(
      'Agent Hub build guard: refusing a production-target build with HUB_JWT_PRIVATE_KEY_B64 set ' +
        'but HUB_PUBLIC_KEY_PEM / HUB_KID missing.\n' +
        'The production public key + kid must be configured together with the production signing key ' +
        '(see docs/SSO_PRODUCTION.md), or the proxies verify against the dev key while hub-auth signs ' +
        'with the production key and no real sign-in works.',
    );
  }
  if (prodPem && prodKid) {
    // The kid must equal the key's derived kid (first 16 hex of the
    // SHA-256 of the public SPKI DER — the src/auth/keys.ts rule), or
    // tokens signed with this key are rejected as an unknown kid.
    const derived = deriveKidFromPem(prodPem);
    if (derived === null) {
      throw new Error(
        'Agent Hub build guard: HUB_PUBLIC_KEY_PEM does not parse as an SPKI PEM public key. ' +
          'Fix the value (see docs/SSO_PRODUCTION.md) — a production build cannot verify tokens otherwise.',
      );
    }
    if (derived !== prodKid) {
      throw new Error(
        `Agent Hub build guard: HUB_KID (${prodKid}) does not match HUB_PUBLIC_KEY_PEM (derived kid ${derived}).\n` +
          'The kid is the first 16 hex chars of the SHA-256 of the public key DER — see docs/SSO_PRODUCTION.md.',
      );
    }
  }
}

/** Kid rule (src/auth/keys.ts): first 16 hex of SHA-256(public SPKI DER). Null when unparseable. */
function deriveKidFromPem(pem: string): string | null {
  try {
    const b64 = pem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\\n/g, '')
      .replace(/\s+/g, '');
    if (!b64) return null;
    const der = Buffer.from(b64, 'base64');
    if (der.length === 0) return null;
    return createHash('sha256').update(der).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

export default defineConfig(({ command, mode }) => {
  const target = resolveBuildTarget(mode);
  if (command === 'build') {
    assertProductionSafe(mode, target);
    console.log(
      `[agent-hub] build target: ${target}` +
        (target === 'production' ? ' (no signing keys in the bundle)' : ' (local signing allowed — QA harness only)'),
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
