/**
 * Server-side RS256 JWT signing for the Hub auth issuer
 * (api/hub-auth.js). Node, node:crypto — the same token format the
 * browser signs in dev (src/auth/jwt.ts) and the proxies verify
 * (api/_lib/verifyJwt.js): header {alg:"RS256",typ:"JWT",kid},
 * claims sub/name/role/iat/exp/iss, exp = iat + 3600.
 *
 * Signing key (server env only, NEVER VITE_-prefixed for production):
 * - HUB_JWT_PRIVATE_KEY_B64 — the production private key (PKCS#8 DER,
 *   base64). Required in production; see the runtime guard below.
 * - VITE_JWT_PRIVATE_KEY_B64 — FALLBACK for QA/preview only: the dev
 *   keypair (kid c804e3560b5c8059), already set in the Vercel project.
 *   Reading it server-side is safe (it is only the client bundling of
 *   VITE_ vars that exposes them); the production-target build guard
 *   (vite.config.ts) still refuses to build when any VITE_JWT_* var
 *   is set, so a production bundle can never inline it.
 *
 * Kid: HUB_JWT_KID when set, else DERIVED from the private key —
 * first 16 hex chars of the SHA-256 of the public key's SPKI DER
 * (the same rule as src/auth/keys.ts). Deriving keeps the kid and
 * the key in step by construction; a manually set HUB_JWT_KID must
 * equal the derived value (the build guard checks the equivalent
 * pair for the public key).
 *
 * RUNTIME PRODUCTION GUARD: when HUB_BUILD_TARGET=production, the
 * issuer REFUSES to sign unless HUB_JWT_PRIVATE_KEY_B64 is set —
 * the dev key must never issue real tokens in production. The build
 * guard cannot see Vercel runtime env, so this runtime check is the
 * second layer (the first layer is vite.config.ts refusing a
 * production build with any VITE_JWT_* var in the build env).
 */

import crypto from 'node:crypto';

export const ISSUER = 'shanta-life-agent-hub';
export const TOKEN_TTL_SECONDS = 3600;

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Kid rule (src/auth/keys.ts): first 16 hex of SHA-256(public SPKI DER). */
export function deriveKidFromPrivateKey(privateKeyB64) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const publicDer = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return crypto.createHash('sha256').update(publicDer).digest('hex').slice(0, 16);
}

/**
 * Resolve the signing configuration from the server env.
 * Returns { privateKeyB64, kid, isProductionKey } or null when no
 * signing key is configured at all. THROWS when the production
 * runtime guard trips (production target without a production key)
 * or when the configured key is unusable — the caller fails closed.
 */
export function signingKeyConfig(env = process.env) {
  const productionKey = typeof env.HUB_JWT_PRIVATE_KEY_B64 === 'string' && env.HUB_JWT_PRIVATE_KEY_B64 !== ''
    ? env.HUB_JWT_PRIVATE_KEY_B64.trim()
    : '';
  const devKey = typeof env.VITE_JWT_PRIVATE_KEY_B64 === 'string' && env.VITE_JWT_PRIVATE_KEY_B64 !== ''
    ? env.VITE_JWT_PRIVATE_KEY_B64.trim()
    : '';
  const target = env.HUB_BUILD_TARGET || '';
  if (target === 'production' && !productionKey) {
    throw new Error(
      'hub-auth: refusing to sign in a production build without HUB_JWT_PRIVATE_KEY_B64 ' +
        '(the dev key must never issue real tokens in production)',
    );
  }
  const privateKeyB64 = productionKey || devKey;
  if (!privateKeyB64) return null;
  const kid = (typeof env.HUB_JWT_KID === 'string' && env.HUB_JWT_KID !== '')
    ? env.HUB_JWT_KID.trim()
    : deriveKidFromPrivateKey(privateKeyB64);
  return { privateKeyB64, kid, isProductionKey: Boolean(productionKey) };
}

/**
 * Sign an SSO token (RS256). `claims` is { sub, name, role }.
 * Returns the compact JWT. Throws on a bad key — callers fail closed.
 */
export function signSsoTokenNode(claims, config, nowMs = Date.now()) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(config.privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: config.kid };
  const payload = { ...claims, iat, exp: iat + TOKEN_TTL_SECONDS, iss: ISSUER };
  const head = base64UrlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${head}.${body}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}
