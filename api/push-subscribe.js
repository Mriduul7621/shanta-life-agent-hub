/**
 * POST /api/push-subscribe — subscribe this device's FCM token to the
 * caller's own topic, `user-{employeeId}`.
 *
 * Why a server route exists at all: @capacitor/push-notifications has
 * NO topic subscribe/unsubscribe API (verified against the 8.1.3
 * sources), so the client cannot subscribe itself. The client sends
 * its FCM token + Hub JWT here; the route derives the topic from the
 * JWT's `sub` claim and subscribes the token through FCM's IID API
 * (batchAdd) with a service-account OAuth token.
 *
 * Security rules (do not weaken):
 * - The topic comes ONLY from the verified JWT's sub — never from the
 *   request body. A client that could name its own topic could join
 *   anyone's topic and read their notifications.
 * - The FCM token is used in this one request and forgotten: it is
 *   never logged, never stored, never returned. There is no token
 *   storage anywhere in the Hub.
 * - No Firebase service account configured (the Firebase project does
 *   not exist yet) → 503 push_not_configured. The client treats that
 *   as silent "push not live yet" and retries on the next sign-in.
 *
 * There is deliberately NO push-unsubscribe route: the client
 * unsubscribes by deleting its FCM token
 * (PushNotifications.unregister()), and FCM drops a dead token from
 * every topic. That also covers session expiry, where the JWT is
 * already dead and could not authenticate an unsubscribe call.
 */
import { verifySsoTokenNode, publicKeyConfig } from './_lib/verifyJwt.js';
import { getFirebaseAccessToken } from './_lib/googleOAuth.js';

export const config = { maxDuration: 30 };

const IID_BATCH_ADD_URL = 'https://iid.googleapis.com/iid/v1:batchAdd';
/** FCM topic names must match `[a-zA-Z0-9-_.~%]+`. */
const TOPIC_NAME_RE = /^[a-zA-Z0-9-_.~%]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifySsoTokenNode(token, publicKeyConfig()) : null;
  if (!claims) {
    console.error('[push-subscribe] unauthorized');
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const fcmToken = body.token;
  if (
    typeof fcmToken !== 'string' ||
    fcmToken.length === 0 ||
    fcmToken.length > 1024 ||
    /\s/.test(fcmToken)
  ) {
    console.error('[push-subscribe] invalid token');
    return res.status(400).json({ error: 'invalid_request' });
  }

  // The topic is derived from the VERIFIED identity only — never from
  // the request body (see the header note).
  const topic = `user-${claims.sub}`;
  if (!TOPIC_NAME_RE.test(topic)) {
    console.error('[push-subscribe] invalid topic');
    return res.status(400).json({ error: 'invalid_request' });
  }

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    console.error('[push-subscribe] push_not_configured');
    return res.status(503).json({ error: 'push_not_configured' });
  }

  try {
    const iid = await fetch(IID_BATCH_ADD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // REQUIRED by the IID API when authorizing with an OAuth 2.0
        // access token (Instance ID server reference, batchAdd
        // parameters). Without it IID answers 401 — found the hard
        // way 2026-11-21 (first device test: subscribe reached IID
        // and got exactly that).
        access_token_auth: 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: `/topics/${topic}`, registration_tokens: [fcmToken] }),
    });
    if (!iid.ok) {
      console.error(`[push-subscribe] iid http ${iid.status}`);
      return res.status(502).json({ error: 'push_subscribe_failed' });
    }
    const data = await iid.json().catch(() => ({}));
    const first = Array.isArray(data.results) ? data.results[0] : null;
    if (!first || typeof first !== 'object' || first.error) {
      console.error(`[push-subscribe] iid error: ${first && first.error ? String(first.error) : 'empty_result'}`);
      return res.status(502).json({ error: 'push_subscribe_failed' });
    }
    console.log('[push-subscribe] subscribed');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[push-subscribe] failed: ${err && err.message ? err.message : 'unknown'}`);
    return res.status(502).json({ error: 'push_subscribe_failed' });
  }
}
