/**
 * FCM push — pure routing helpers (no Capacitor imports, no side
 * effects), so they are unit-testable in Node (QA §29) and reusable
 * by the server route's tests.
 *
 * Delivery design (Mahadi 2026-11-21, shared across Hub + Learning
 * Hub + LeadFlow): ONE Firebase project ("Shanta Life Apps"), topic
 * delivery, NO token storage anywhere. Each app subscribes the device
 * to the topic `user-{employeeId}` on native sign-in; the LH/LF
 * servers publish each user notification to that topic, so a
 * notification lands in every subscribed app — including the Hub.
 * The FCM notification IS the Hub's notification surface: the Hub has
 * NO in-app bell (by design — do not build one).
 *
 * Tap payload (sent by the LH/LF servers):
 *   { source: 'leadflow' | 'learning', title, body,
 *     route, module: 'leadflow' | 'learning' }
 * `route` is an optional path INSIDE the source module (e.g.
 * `/workbench`). It is only honoured as a relative path — an absolute
 * URL in push data must never drive navigation (open redirect).
 */
import { MODULES } from '../data/modules';

/** FCM topic names must match `[a-zA-Z0-9-_.~%]+`. */
const TOPIC_NAME_RE = /^[a-zA-Z0-9-_.~%]+$/;
/** Employee IDs are short; anything longer is not an ID. */
const MAX_EMPLOYEE_ID_LENGTH = 100;

/**
 * The FCM topic for one employee: `user-{employeeId}`. Returns null
 * for anything that is not a usable ID (empty, whitespace, or
 * characters FCM rejects) — the caller then skips subscribing
 * silently instead of sending a bad topic to FCM.
 */
export function userPushTopic(employeeId: unknown): string | null {
  if (typeof employeeId !== 'string') return null;
  const id = employeeId.trim();
  if (id.length === 0 || id.length > MAX_EMPLOYEE_ID_LENGTH) return null;
  const topic = `user-${id}`;
  return TOPIC_NAME_RE.test(topic) ? topic : null;
}

/** The data payload LH/LF attach to a notification (all fields optional). */
export interface PushNotificationData {
  source?: unknown;
  module?: unknown;
  route?: unknown;
  title?: unknown;
  body?: unknown;
}

function moduleUrl(moduleId: 'leadflow' | 'learning-hub'): string | null {
  return MODULES.find((m) => m.id === moduleId)?.url ?? null;
}

/**
 * A `route` is safe only as a relative path inside the module: it must
 * start with exactly one `/` (no `//` protocol-relative, no absolute
 * URL, no backslash, no whitespace). Any `#fragment` is dropped — the
 * module must never receive a fragment from push data. Returns the
 * cleaned path, or '' when the route is unusable.
 */
function safeRoute(route: unknown): string {
  if (typeof route !== 'string') return '';
  const path = route.split('#')[0];
  if (!path.startsWith('/')) return '';
  if (path.startsWith('//')) return '';
  if (path.includes('\\') || /\s/.test(path)) return '';
  return path;
}

/**
 * Where a notification tap navigates (same-tab, exactly like tapping
 * the module's tile — plain module URL, no SSO fragment: LeadFlow and
 * Learning Hub are not ssoJoined, so their tiles open as plain links
 * too). Unknown or missing data navigates Home ('/').
 *
 * Source aliases: 'learning-hub' and 'lead-flow' are accepted alongside
 * the canonical 'learning' / 'leadflow' — the LH/LF servers send the
 * canonical values, but a tap must not fail on the longer form.
 */
export function resolvePushTarget(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '/';
  const d = data as PushNotificationData;
  const rawSource = typeof d.source === 'string' ? d.source : typeof d.module === 'string' ? d.module : '';
  const source = rawSource.trim().toLowerCase();
  const moduleId =
    source === 'leadflow' || source === 'lead-flow'
      ? 'leadflow'
      : source === 'learning' || source === 'learning-hub'
        ? 'learning-hub'
        : null;
  if (!moduleId) return '/';
  const base = moduleUrl(moduleId);
  if (!base) return '/';
  return `${base}${safeRoute(d.route)}`;
}
