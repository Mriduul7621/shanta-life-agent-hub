/**
 * One-retry fetch for the Hub proxies (retail / LeadFlow / Learning).
 *
 * A fresh feed fetch retries ONCE after a short delay (~1s) on
 * failure, so a transient cold start does not leave a page failed —
 * the Vercel functions can take a moment to wake, and a single
 * failed attempt used to drop real users onto the demo fallback
 * (2026-11-20: a real employee's retail fetch failed transiently and
 * Home showed her fixture figures as if they were her data).
 *
 * 401 is NEVER retried: the session is dead, and AuthContext's
 * expiry checker signs the session out separately — retrying a dead
 * token is pointless. Every other failure (network error, timeout,
 * 5xx, non-JSON) gets the one retry; the second failure throws.
 */

const RETRY_DELAY_MS = 1000;

export async function fetchProxyJson(
  url: string,
  token: string,
  timeoutMs: number,
  label: string,
): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 401) throw new Error(`${label}: HTTP 401`);
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      lastError = err;
      // 401 = dead session — never retry.
      if (err instanceof Error && err.message === `${label}: HTTP 401`) throw err;
    }
  }
  throw lastError;
}
