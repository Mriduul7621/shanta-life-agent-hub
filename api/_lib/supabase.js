/**
 * Supabase PostgREST client + Dhaka day helpers, shared by the Hub's
 * data proxies (LeadFlow + Learning Hub, Phase 2).
 *
 * Access method (Phase 2 spec §1): plain `fetch` against PostgREST with
 * the service_role key, server-side only. No new dependency. The
 * service_role key bypasses RLS, so scoping is enforced in proxy code
 * (never trusted to the client), and queries use explicit column
 * allowlists — never `select=*` on `users`, `employees`, or `leads`
 * (spec §12.3). Nothing here ever logs a key, a token, or a row.
 *
 * Dhaka day bounds: LeadFlow's `next_follow_up_at` is a naive TIMESTAMP
 * storing UTC wall time (spec §2.5), so a Dhaka day is compared as
 * instants — 00:00 Dhaka = 18:00 UTC the previous day (UTC+6, no DST).
 * `parseTsMs` treats a timestamp without an offset as UTC.
 */

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Read a Supabase project's URL + service_role key from the server env.
 * Returns null when either is missing — the proxy then fails closed
 * with a generic "not configured" error. NEVER logs the values.
 */
export function supabaseConfig(env, urlVar, keyVar) {
  const url = typeof env[urlVar] === 'string' ? env[urlVar].replace(/\/+$/, '') : '';
  const key = typeof env[keyVar] === 'string' ? env[keyVar] : '';
  if (!url || !key) return null;
  return { url, key };
}

function headers(cfg, extra = {}) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: 'application/json', ...extra };
}

function restUrl(cfg, table, params) {
  const qs = new URLSearchParams(params).toString();
  return `${cfg.url}/rest/v1/${table}?${qs}`;
}

/**
 * GET rows from a PostgREST table. `filters` is a flat map of
 * PostgREST query params (e.g. { 'is_deleted': 'eq.false' }).
 * Throws a generic error on any non-2xx (no body — PostgREST error
 * bodies can echo the query).
 */
export async function supaGet(cfg, table, { select, filters = {}, order, limit, offset } = {}) {
  const params = { select, ...filters };
  if (order) params.order = order;
  if (limit !== undefined) params.limit = String(limit);
  if (offset !== undefined) params.offset = String(offset);
  const res = await fetch(restUrl(cfg, table, params), {
    headers: headers(cfg),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Attach the status only (no body — PostgREST error bodies can echo
    // the query). Callers use the status to retry without an optional
    // column when the live schema has drifted (spec §15.2).
    const err = new Error(`supabase ${table} HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`supabase ${table} unexpected shape`);
  return data;
}

/**
 * Exact row count via `Prefer: count=exact` (no row bodies — limit=0).
 * Reads the total from the Content-Range header (`*\/N` or `a-b/N`).
 * `selectCol` is the column to select — 'id' by default, but views
 * like credit_balances have no id column, so callers pass one that
 * exists (e.g. 'employee_id').
 */
export async function supaCount(cfg, table, filters = {}, selectCol = 'id') {
  const params = { select: selectCol, limit: '0', ...filters };
  const res = await fetch(restUrl(cfg, table, params), {
    headers: headers(cfg, { Prefer: 'count=exact' }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`supabase ${table} count HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const range = res.headers.get('content-range') || '';
  const m = /\/(\d+)\s*$/.exec(range);
  if (!m) throw new Error(`supabase ${table} count unreadable`);
  return Number(m[1]);
}

/** POST a PostgREST RPC call. Throws a generic error on non-2xx. */
export async function supaRpc(cfg, fn, args) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`supabase rpc ${fn} HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Today's date in Asia/Dhaka, ISO YYYY-MM-DD (same rule as retailSummary's dhakaToday). */
export function dhakaTodayIso() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

/** UTC instants (epoch ms) bounding a Dhaka calendar day (YYYY-MM-DD). */
export function dhakaDayBounds(todayIso) {
  const [y, m, d] = todayIso.split('-').map(Number);
  return {
    startMs: Date.UTC(y, m - 1, d - 1, 18, 0, 0),
    endMs: Date.UTC(y, m - 1, d, 18, 0, 0),
  };
}

/**
 * Parse a timestamp string as UTC milliseconds. A value without an
 * offset (naive TIMESTAMP from the database) is treated as UTC wall
 * time. Returns null for missing/invalid values.
 */
export function parseTsMs(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const ms = Date.parse(hasOffset ? s : `${s}Z`);
  return Number.isFinite(ms) ? ms : null;
}
