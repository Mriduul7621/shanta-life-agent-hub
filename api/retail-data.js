/**
 * Hub-side Retail Sales Dashboard proxy (Vercel serverless function).
 *
 * Why a proxy (spec §2): the retail workbook is private (gviz returns
 * 401), the Retail Dashboard's live endpoint sends no CORS headers (the
 * browser cannot fetch it directly), and the committed sales-data.json
 * snapshot is stale. So the Dashboard page calls this function
 * same-origin, and the function fetches the retail endpoint
 * server-to-server (no CORS issue, no credentials needed).
 *
 * SECURITY (spec §9 — server-side scoping is a MUST): the retail payload
 * contains policy-owner PII. This function verifies the caller's Hub JWT,
 * fetches the payload, and returns ONLY the computed summary for the
 * caller's visible slice (Employee -> own, Team Lead -> own + downline,
 * Manager -> own + subtree, Admin/T&D -> org-wide). The browser never
 * receives raw rows — not even in-scope ones, because the page renders
 * aggregates only. No JWT = 401. Response is `private, no-store`.
 *
 * Demo fixture: fictional 999xxxx users match no real rows, so when
 * HUB_DEMO_FIXTURE=true, demo callers get the synthetic slice
 * (api/_lib/demoFixture.js) through the same summarizer, labelled
 * demo: true. The locks are: the flag itself (set only on this demo
 * project, never on a real production project), the 999xxxx caller
 * check (real Employee IDs never start with 999), and the
 * vite.config.ts build guard (a HUB_BUILD_TARGET=production build
 * FAILS with HUB_DEMO_FIXTURE=true). NOTE: do NOT gate on
 * VERCEL_ENV — this demo project's main-branch deployments run on
 * the production target, so VERCEL_ENV is always 'production' here
 * and such a check would silently disable the fixture (found live
 * 2026-11-20: the Dashboard showed the empty state until the check
 * was removed).
 * No new secrets: the retail endpoint needs no credentials, and the
 * proxy verifies with the PUBLIC key (api/_lib/verifyJwt.js).
 *
 * Caching: the retail payload is cached in-memory for 5 minutes (warm
 * invocations), and the built index is cached per (payload version,
 * day, PERIOD) — the index holds period-filtered buckets, so one
 * period's index must never serve another period's summary. The
 * payload cache itself is period-agnostic (raw rows, no aggregates).
 * The response itself is never cached (private, no-store).
 *
 * Time-frame filter: `?period=this-month|3m|6m|this-year|all`
 * (default 'all'). An invalid value is a 400 — never silently fall
 * back to 'all', or the caller would read the wrong window.
 */
import { verifySsoTokenNode, publicKeyConfig } from './_lib/verifyJwt.js';
import { summarizeWithIndex, buildRetailIndex, dhakaToday } from './_lib/retailSummary.js';
import { parsePeriodParam } from './_lib/periods.js';
import { buildDemoPayload } from './_lib/demoFixture.js';

export const config = { maxDuration: 30 };

const RETAIL_URL = 'https://retail-dashboard-zeta.vercel.app/api/sales-data';
const PAYLOAD_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const INDEX_CACHE_MAX = 8; // 5 periods x a couple of payload versions

let payloadCache = null; // { payload, fetchedAtMs }
let indexCache = new Map(); // key -> index (key includes the period)

function demoFixtureEnabled(env) {
  return env.HUB_DEMO_FIXTURE === 'true';
}

async function fetchRetailPayload() {
  const now = Date.now();
  if (payloadCache && now - payloadCache.fetchedAtMs < PAYLOAD_TTL_MS) {
    return payloadCache.payload;
  }
  const res = await fetch(RETAIL_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`retail endpoint HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.records)) {
    throw new Error('retail endpoint returned an unexpected shape');
  }
  payloadCache = { payload, fetchedAtMs: now };
  return payload;
}

function indexFor(payload, today, period) {
  const key = `${payload?.sync?.lastUpdated || ''}|${today}|${period}`;
  const hit = indexCache.get(key);
  if (hit) return hit;
  const index = buildRetailIndex(payload, today, period);
  indexCache.set(key, index);
  if (indexCache.size > INDEX_CACHE_MAX) {
    indexCache.delete(indexCache.keys().next().value);
  }
  return index;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return send(res, 405, { error: 'method not allowed' });
    }
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = token ? verifySsoTokenNode(token, publicKeyConfig()) : null;
    if (!claims) {
      return send(res, 401, { error: 'a valid Hub sign-in is required' });
    }
    const period = parsePeriodParam(new URL(req.url || '/', 'http://localhost').searchParams.get('period'));
    if (period === null) {
      return send(res, 400, { error: 'invalid period' });
    }
    const today = dhakaToday();
    // Demo users (fictional 999xxxx IDs) get the synthetic slice — never
    // real rows — when the fixture gate is open. Real users always get
    // the live payload, fixture or not.
    if (claims.sub.startsWith('999') && demoFixtureEnabled(process.env)) {
      const summary = summarizeWithIndex(
        buildRetailIndex(buildDemoPayload(today), today, period),
        { employeeId: claims.sub, role: claims.role },
      );
      summary.demo = true;
      return send(res, 200, summary);
    }
    const payload = await fetchRetailPayload();
    const summary = summarizeWithIndex(indexFor(payload, today, period), {
      employeeId: claims.sub,
      role: claims.role,
    });
    return send(res, 200, summary);
  } catch (err) {
    // No PII, no internals in the response or the log — the message is
    // generic; the status distinguishes an upstream failure (502).
    const upstream = err instanceof Error && /retail endpoint|fetch|timeout|aborted/i.test(err.message);
    if (!upstream) console.error('[retail-data] unexpected error:', err instanceof Error ? err.message : 'unknown');
    return send(res, upstream ? 502 : 500, {
      error: upstream
        ? 'the Retail Sales Dashboard is not reachable right now'
        : 'could not load the dashboard',
    });
  }
}
