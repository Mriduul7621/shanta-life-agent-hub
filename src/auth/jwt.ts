/**
 * Minimal HS256 JWT helpers (WebCrypto, no dependencies).
 *
 * SECURITY — read before touching this file:
 * - Milestone 1 signs tokens IN THE BROWSER with a DEV-ONLY secret from
 *   VITE_JWT_SECRET, solely so the demo provider can issue a token whose
 *   format Milestone 2 modules can verify. This is NOT a production design:
 *   any secret shipped to the browser is public. Production tokens MUST be
 *   issued server-side (Supabase Edge Function / auth service) with a secret
 *   the browser never sees. See docs/SSO_TOKEN.md.
 * - The Hub verifies the token on session restore (signature + exp) so a
 *   tampered sessionStorage value cannot forge a session.
 */

export interface SsoClaims {
  sub: string; // Employee ID
  name: string;
  role: string;
  iat: number; // issued-at, seconds since epoch
  exp: number; // expiry, seconds since epoch (iat + 3600)
  iss: string; // 'shanta-life-agent-hub'
}

export const TOKEN_TTL_SECONDS = 3600; // 1 hour

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export async function signSsoToken(
  claims: Omit<SsoClaims, 'iat' | 'exp' | 'iss'>,
  secret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(nowMs / 1000);
  const payload: SsoClaims = { ...claims, iat, exp: iat + TOKEN_TTL_SECONDS, iss: 'shanta-life-agent-hub' };
  const head = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmacSha256(secret, `${head}.${body}`));
  return `${head}.${body}.${signature}`;
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

/** Verify signature (HS256) and expiry. Returns the claims when valid, null otherwise. */
export async function verifySsoToken(token: string, secret: string): Promise<SsoClaims | null> {
  const decoded = decodeSsoToken(token);
  if (!decoded) return null;
  const parts = token.split('.');
  const expected = base64UrlEncode(await hmacSha256(secret, `${parts[0]}.${parts[1]}`));
  if (expected !== parts[2]) return null;
  if (decoded.payload.exp * 1000 <= Date.now()) return null;
  if (decoded.payload.iss !== 'shanta-life-agent-hub') return null;
  return decoded.payload;
}
