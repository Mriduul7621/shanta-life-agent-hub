/**
 * RS256 JWT helpers (WebCrypto, no dependencies) — Milestone 2.
 *
 * SECURITY — read before touching this file:
 * - ONE algorithm: RS256. HS256 was removed entirely in Milestone 2 — there
 *   is no symmetric fallback, because the joined calculators are static sites
 *   with no backend: a shared secret would have to ship in their bundles and
 *   would be public by definition. RS256 fixes that: only the issuer holds
 *   the private key; modules verify with the PUBLIC key bundled in code
 *   (see ./keys.ts). See docs/SSO_TOKEN.md.
 * - `signSsoToken` exists ONLY for dev/QA builds, where the Hub signs demo
 *   tokens locally with a dev-only private key from VITE_JWT_PRIVATE_KEY_B64.
 *   Production tokens MUST be issued server-side (Supabase Edge Function)
 *   with a production key the browser never sees. The build-target guard in
 *   vite.config.ts refuses a production-target build with any VITE_JWT_*
 *   signing variable set.
 * - `verifySsoToken` is the shared verification logic: the Hub uses it on
 *   session restore and on its expiry timer, and joined modules implement
 *   the same checks (see the Milestone 2 protocol). It fails closed — any
 *   malformed input, unknown kid, wrong issuer, expired token, or bad
 *   signature returns null.
 * - The token is NEVER put in a URL, in localStorage, or in any log.
 *   Transport to a module is postMessage only (see ../sso/handoff.ts).
 */
import { HUB_KID, KNOWN_KIDS } from './keys';

export interface SsoClaims {
  sub: string; // Employee ID
  name: string;
  role: string;
  iat: number; // issued-at, seconds since epoch
  exp: number; // expiry, seconds since epoch (iat + 3600)
  iss: string; // 'shanta-life-agent-hub'
}

export const TOKEN_TTL_SECONDS = 3600; // 1 hour
export const ISSUER = 'shanta-life-agent-hub';
export const CLOCK_SKEW_SECONDS = 60; // allowed clock skew on exp
export const ROLES: ReadonlySet<string> = new Set(['employee', 'team_lead', 'manager', 'admin']);

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Standard (not URL-safe) base64 → bytes. Used for PKCS#8 DER and PEM bodies. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  if (!b64) throw new Error('empty public key');
  return base64ToBytes(b64);
}

async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const der = base64ToBytes(privateKeyB64);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// Verification runs on session restore and every 30 s; cache the imported
// key so a PEM string is parsed once per page load.
const publicKeyCache = new Map<string, Promise<CryptoKey>>();

function importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  const cached = publicKeyCache.get(publicKeyPem);
  if (cached) return cached;
  const pending = (async () => {
    const der = pemToDer(publicKeyPem);
    return crypto.subtle.importKey(
      'spki',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  })();
  publicKeyCache.set(publicKeyPem, pending);
  return pending;
}

/**
 * Sign an SSO token (RS256). DEV/QA ONLY — see the file header.
 * `privateKeyB64` is the PKCS#8 DER private key, base64-encoded.
 */
export async function signSsoToken(
  claims: Omit<SsoClaims, 'iat' | 'exp' | 'iss'>,
  privateKeyB64: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid: HUB_KID };
  const iat = Math.floor(nowMs / 1000);
  const payload: SsoClaims = { ...claims, iat, exp: iat + TOKEN_TTL_SECONDS, iss: ISSUER };
  const head = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${head}.${body}`;
  const key = await importPrivateKey(privateKeyB64);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Decode header + payload WITHOUT verifying the signature. Display/debug only. */
export function decodeSsoToken(token: string): { header: unknown; payload: SsoClaims } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as SsoClaims;
    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Verify an SSO token (RS256) against a public key (SPKI PEM).
 *
 * Strictly rejects — returns null — on ANY of:
 * - not exactly three parts, or any part undecodable / not JSON
 * - header `alg` anything other than exactly `RS256` (including `none` and
 *   `HS256` — one algorithm, no fallback)
 * - header `kid` missing or not in `knownKids`
 * - signature mismatch (RSASSA-PKCS1-v1_5 + SHA-256)
 * - `iss` anything other than `shanta-life-agent-hub`
 * - `exp` missing, not a number, or in the past (≤ 60 s clock skew allowed)
 * - `iat` missing or not a number
 * - `sub` missing or empty
 * - `role` outside {employee, team_lead, manager, admin}
 *
 * `knownKids` defaults to this build's KNOWN_KIDS; pass current + previous
 * kids explicitly during rotation, or from a test harness.
 */
export async function verifySsoToken(
  token: string,
  publicKeyPem: string,
  knownKids: ReadonlySet<string> = KNOWN_KIDS,
  nowMs: number = Date.now(),
): Promise<SsoClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as {
      alg?: unknown;
      kid?: unknown;
    };
    if (typeof header !== 'object' || header === null) return null;
    if (header.alg !== 'RS256') return null;
    if (typeof header.kid !== 'string' || !knownKids.has(header.kid)) return null;

    const key = await importPublicKey(publicKeyPem);
    const signature = base64UrlDecode(parts[2]);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as SsoClaims;
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
    // Any failure — malformed base64, bad JSON, bad key — fails closed.
    return null;
  }
}
