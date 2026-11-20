/**
 * RS256 JWT verification for the Hub-side proxy (Node, node:crypto).
 *
 * The SAME strict checks as the browser's verifySsoToken
 * (src/auth/jwt.ts) — the two implementations must stay in step:
 * - exactly three parts, decodable header + payload JSON
 * - header alg exactly RS256 (no `none`, no HS256 fallback)
 * - header kid in the known set
 * - RSASSA-PKCS1-v1_5 + SHA-256 signature valid for the public key
 * - iss exactly 'shanta-life-agent-hub'
 * - exp a finite number, not past (60 s clock skew allowed)
 * - iat a finite number
 * - sub a non-empty string, name a string, role in the four values
 * Anything else returns null (fail closed).
 *
 * Public key: HUB_PUBLIC_KEY_PEM / HUB_KID env vars (server-only, NOT
 * VITE_-prefixed) when set as a matching pair, else the bundled DEV key
 * below. The dev key is PUBLIC material — it is the same key committed in
 * src/auth/keys.ts (DEV_PUBLIC_KEY_PEM / DEV_KID, kid c804e3560b5c8059).
 * The two copies MUST match — scripts/qa-retail-live.mjs checks that.
 * Production uses a server-issued keypair: set HUB_PUBLIC_KEY_PEM +
 * HUB_KID in the Vercel project to the production public key.
 */
import crypto from 'node:crypto';

export const DEV_KID = 'c804e3560b5c8059';
export const DEV_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEHoMm02rFV2CEKJENpk
8GhABlXmR+dsz/7twrakwZLOv7Q4n+rj5MRkDd0prBKBPEAP9MpoHE4Ev8fSL/iD
GHGz5vSGQr94BKtLmr+JqRggkDOPwwyo2AnrCF3jIXoBiKsRG6jcADxyFfzgdZNc
aBEMPvWctJS1eQhz0AHWKQDjKl1xG0p1oyahOzTn4/o+Vaz+E16yIBgyZHXCCYvU
Xm6de4sFCUxAW3Q+1oXHdGkyA+g9LpK5uV8IA3xWBHH1xwOzg3oSDYppLUfi9f69
708HrB5Tod6Y8lFg0FQH+j7fa+lKwb0B4ClL8TLxXw9OOY6tYRnhxRCh1WS2fRon
DwIDAQAB
-----END PUBLIC KEY-----`;

export const ISSUER = 'shanta-life-agent-hub';
export const CLOCK_SKEW_SECONDS = 60;
const ROLES = new Set(['employee', 'team_lead', 'manager', 'admin']);

export function publicKeyConfig(env = process.env) {
  const pem = env.HUB_PUBLIC_KEY_PEM || DEV_PUBLIC_KEY_PEM;
  const kid = env.HUB_KID || DEV_KID;
  return { pem, kids: new Set([kid]) };
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url');
}

/**
 * Verify an SSO token. Returns the claims { sub, name, role, iat, exp,
 * iss } or null. `nowMs` is injectable for tests.
 */
export function verifySsoTokenNode(token, config = publicKeyConfig(), nowMs = Date.now()) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    if (typeof header !== 'object' || header === null) return null;
    if (header.alg !== 'RS256') return null;
    if (typeof header.kid !== 'string' || !config.kids.has(header.kid)) return null;

    const signature = base64UrlDecode(parts[2]);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    if (!verifier.verify(config.pem, signature)) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    if (payload.iss !== ISSUER) return null;
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
    if (Math.floor(nowMs / 1000) > payload.exp + CLOCK_SKEW_SECONDS) return null;
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (typeof payload.name !== 'string') return null;
    if (typeof payload.role !== 'string' || !ROLES.has(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}
