/**
 * Google OAuth2 access tokens for Firebase Cloud Messaging (Node,
 * node:crypto — no Firebase Admin SDK dependency).
 *
 * The Hub's /api/push-subscribe route subscribes a device's FCM token
 * to the topic `user-{employeeId}` through FCM's IID API
 * (https://iid.googleapis.com/iid/v1:batchAdd), which needs a Google
 * OAuth2 access token with the firebase.messaging scope. The token is
 * minted from a Firebase service-account key with the standard
 * JWT-bearer grant (RFC 7523): sign a short-lived RS256 JWT with the
 * service account's private key, exchange it at oauth2.googleapis.com.
 *
 * Credential (server env only, NEVER VITE_-prefixed):
 * - FIREBASE_SERVICE_ACCOUNT_B64 — base64 of the service-account JSON
 *   downloaded from Firebase console → Project settings → Service
 *   accounts → Generate new private key (project "Shanta Life Apps").
 *   The file contains a private key: never commit it, never paste it
 *   into chat — same handling as the Hub signing key.
 *
 * No credential configured → getFirebaseAccessToken() returns null
 * and the caller answers 503 push_not_configured. Push is an optional
 * surface: a missing Firebase project must degrade to "no push", never
 * to a crash. Tokens are cached in memory until 5 minutes before
 * expiry (one mint per hour per instance at most).
 */
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CLOCK_SKEW_SECONDS = 300;

let cached = { token: null, expiresAtMs: 0 };

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Parse + validate the service-account JSON from the env. Returns the
 * parsed account { project_id, client_email, private_key } or null
 * when unset, unparseable, or missing the fields the grant needs.
 */
export function parseServiceAccount(env = process.env) {
  const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (typeof b64 !== 'string' || b64 === '') return null;
  try {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (typeof json !== 'object' || json === null) return null;
    if (json.type !== 'service_account') return null;
    if (typeof json.client_email !== 'string' || json.client_email === '') return null;
    if (typeof json.private_key !== 'string' || json.private_key === '') return null;
    if (typeof json.project_id !== 'string' || json.project_id === '') return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * A Google OAuth2 access token for FCM, or null when push is not
 * configured (no service account) or the exchange fails. Never throws.
 */
export async function getFirebaseAccessToken(env = process.env) {
  if (cached.token && Date.now() < cached.expiresAtMs) return cached.token;
  const account = parseServiceAccount(env);
  if (!account) {
    console.error('[googleOAuth] service account missing or invalid');
    return null;
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(account.private_key);
    const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      console.error(`[googleOAuth] token exchange failed: http ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (typeof data.access_token !== 'string' || data.access_token === '') {
      console.error('[googleOAuth] token exchange failed: no access_token');
      return null;
    }
    const ttl = typeof data.expires_in === 'number' && data.expires_in > CLOCK_SKEW_SECONDS
      ? data.expires_in
      : 3600;
    cached = { token: data.access_token, expiresAtMs: Date.now() + (ttl - CLOCK_SKEW_SECONDS) * 1000 };
    return cached.token;
  } catch (err) {
    console.error(`[googleOAuth] token exchange error: ${err && err.message ? err.message : 'unknown'}`);
    return null;
  }
}
