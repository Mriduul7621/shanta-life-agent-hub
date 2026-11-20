/**
 * Retail Sales Dashboard summary — PURE module (no Node/browser APIs except
 * Date/Intl). Shared by the Hub-side proxy (api/retail-data.js) and the
 * Node QA checks (scripts/qa-retail-live.mjs), so the formulas the live
 * check verifies are the exact production formulas.
 *
 * Source of truth: ~/workspace/agent-hub-retail-spec/RETAIL_DASHBOARD_SPEC.md
 * (14 sections, 2026-11-20) + the Retail Dashboard's own code
 * (Mriduul7621/Retail_Dashboard @ 24b2bb6f, dist/index.html + api/sales-data.js).
 * Every formula below is a faithful port of the retail app's function named
 * in the comment — do not "improve" the math without checking the retail
 * code first; the two apps must agree.
 *
 * The proxy returns ONLY this summary to the browser — never raw rows. The
 * Dashboard page renders aggregates only, so no policy-owner PII ever
 * leaves the server (stricter than spec §9.1, which allows returning the
 * visible slice). The ONE exception is the Home Due widget's due rows
 * (`dueRowsOverdue` / `dueRowsUpcoming`): the viewer's 3 most overdue
 * dues and 3 nearest upcoming dues, scoped server-side, each row
 * carrying ONLY the owner name, the due date and the premium — no
 * policy number, no mobile (the payload has no mobile field anywhere).
 *
 * Reconciliation with the retail app (2026-11-20, Mahadi: the Hub's
 * Due Premium and Active FA did not match his Retail Dashboard):
 * Due Premium is MONTH-TO-DATE — the retail app's Due KPI uses the
 * selected range and its default preset is MTD (dist/index.html,
 * `pdDueRowsForWindow` + the MTD default). Full Nov 2026 was 249
 * pol / ৳16,53,216; MTD (to 2026-11-20) is 84 pol / ৳8,33,491.
 * Active FAs is EVER-SOLD — the retail app's headline KPI counts
 * producers whose `activity` is 'Active', which is exactly "has any
 * PR row" (api/sales-data.js); the Hub rebuilds the same set from
 * the records (everSet), verified equal on live data (537 of 629).
 * The old Hub definitions (full calendar month; sold in the last
 * 6 months = 360 of 629) were dropped, not kept as options: the
 * retail app is authoritative for retail figures.
 *
 * Time-frame filter: buildRetailIndex takes a period ('today' /
 * 'this-month' / '3m' / '6m' / 'this-year' / 'all' / 'custom',
 * default 'all' — the summarizer default stays 'all'; only the
 * proxy/client default is 'today', see api/_lib/periods.js) and, for
 * 'custom', a validated { start, end } range. The BUSINESS buckets
 * (FA / direct / residual / BE totals / org) are built from the
 * PR rows whose `date` falls in the window, so Total Premium / FYCP /
 * Policies / the leaderboard / the Unassigned line all follow the
 * period. Due Premium (month-to-date), Persistency (cumulative)
 * and Active FAs (ever-sold) keep their OWN windows — they are
 * computed from the unfiltered records / due sheet, so they never move
 * with the period selector. The summary also exposes the raw
 * newPremium / deferredPremium sums (FYCP = new + deferred) for the
 * Home FYCP card's sub-text, the `dueWindow` MTD range, `duesThisWeek`
 * (Inforce dues inside the current Bangladesh calendar week,
 * Sunday–Saturday, with its week range) and the Home Due widget's
 * two due-row lists (`dueRowsOverdue`: the 3 most overdue dues,
 * earliest first; `dueRowsUpcoming`: the 3 nearest upcoming dues,
 * nearest first, due today included).
 */
import { periodDateWindow } from './periods.js';

// ---- Orphan rule (standing, Mahadi 2026-11-13; retail zsIsOrphan* ) ----
export const ORPHAN_CODES = new Set([
  '11',
  '1101',
  '110101',
  '11010101',
  '1101010101',
  '1101010101001',
]);

export function isOrphanName(name) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return n === 'shantalifeinsuranceplc' || n === 'shantainsuranceplc';
}

export function isOrphanCode(code) {
  return ORPHAN_CODES.has(String(code || '').trim());
}

export function isOrphanBE(code, name) {
  return String(code || '').trim().toUpperCase() === 'SLI' || isOrphanName(name);
}

export function isTseries(policy) {
  return /^T/i.test(String(policy || ''));
}

// ---- Date helpers (retail dhakaToday / addMonthsIso / addDaysIso) ----
export function dhakaToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

export function addMonthsIso(value, months) {
  const [y, m, d] = value.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function addDaysIso(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthEndIso(value) {
  const [y, m] = value.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * The Bangladesh calendar week containing `todayIso`: Sunday–Saturday.
 * The retail app has NO week convention (no week logic anywhere in
 * dist/index.html), so the Sunday–Saturday week is the Hub's own
 * definition (Mahadi's "Dues this week", 2026-11-20) — the widget
 * shows the week date range so the definition is visible.
 */
export function weekWindowIso(todayIso) {
  const d = new Date(`${todayIso}T00:00:00Z`);
  const start = addDaysIso(todayIso, -d.getUTCDay()); // 0 = Sunday
  return { start, end: addDaysIso(start, 6) };
}

function modeMonths(mode) {
  const x = String(mode || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (x === 'monthly') return 1;
  if (x === 'quarterly') return 3;
  if (x === 'halfyearly') return 6;
  if (x === 'yearly' || x === 'annual' || x === 'annually') return 12;
  return 0;
}

function receiptKind(r) {
  const t = String(r.type || '').trim().toLowerCase();
  if (t === 'deferred' && Number(r.deferred) > 0) return 'deferred';
  if ((/^\d+r$/i.test(t) || t === 'renewal') && Number(r.renewal) > 0) return 'renewal';
  return '';
}

const isNewType = (r) => String(r.type || '').trim().toLowerCase() === 'new';
const num = (v) => Number(v) || 0;

// ---- Policy ledgers (retail policyLedgers, no scope/channel filters) ----
// One ledger per policy|FA: the instalment schedule built from the first
// New receipt (instalments every payment-mode frequency through the term;
// year-1 = Deferred, year-2+ = Renewal; SDPP grace 3 months, others 30
// days). Only used for the Due Premium ledger fallback (§3.3) — policies
// the Due sheet does not cover (in practice all T-series).
function buildLedgers(records, asOf) {
  const groups = new Map();
  for (const r of records || []) {
    if (!r.policy) continue;
    const key = `${String(r.policy)}|${String(r.faCode || '')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const history of groups.values()) {
    history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const first = history.find((r) => isNewType(r));
    if (!first || !first.date) continue;
    const frequency = modeMonths(first.mode);
    const term = Math.max(0, Number(first.term) || 0);
    if (!frequency || !term) continue;
    const maturity = addMonthsIso(first.date, Math.round(term * 12));
    const limit = asOf;
    const product = first.product || '';
    const isSDPP =
      product.toLowerCase().includes('depositor') && product.toLowerCase().includes('protection');
    const graceMonths = isSDPP ? 3 : 0;
    const graceDays = isSDPP ? 0 : 30;
    const receipts = { deferred: [], renewal: [] };
    for (const r of history) {
      const kind = receiptKind(r);
      if (kind && r.date >= first.date && r.date <= limit) {
        receipts[kind].push({ date: r.date, amount: num(kind === 'deferred' ? r.deferred : r.renewal) });
      }
    }
    for (const k of Object.keys(receipts)) receipts[k].sort((a, b) => a.date.localeCompare(b.date));
    const sequence = { deferred: 0, renewal: 0 };
    const schedule = [];
    for (let n = frequency; n < Math.round(term * 12); n += frequency) {
      const dueDate = addMonthsIso(first.date, n);
      if (dueDate >= maturity || dueDate > limit) break;
      const kind = n < 12 ? 'deferred' : 'renewal';
      sequence[kind]++;
      const prior = history
        .filter(
          (r) =>
            r.date < dueDate &&
            ((isNewType(r) && num(r.new) > 0) || receiptKind(r)),
        )
        .at(-1);
      let expected = prior
        ? isNewType(prior)
          ? num(prior.new)
          : receiptKind(prior) === 'deferred'
            ? num(prior.deferred)
            : num(prior.renewal)
        : num(first.new);
      const receipt = receipts[kind][sequence[kind] - 1] || null;
      if (receipt && receipt.amount > 0) expected = expected || receipt.amount;
      const paidAmount = receipt ? Math.min(expected, receipt.amount) : 0;
      const unpaid = Math.max(0, expected - paidAmount);
      const graceEnd = graceMonths
        ? addMonthsIso(dueDate, graceMonths)
        : addDaysIso(dueDate, graceDays);
      schedule.push({
        policy: first.policy,
        faCode: first.faCode || '',
        beCode: first.beCode || '',
        dueDate,
        kind,
        expected,
        paidAmount,
        unpaid,
        graceEnd,
      });
    }
    const expectedTotal = schedule.reduce((a, x) => a + x.expected, 0);
    if (expectedTotal > 0) {
      out.push({
        policy: first.policy,
        faCode: first.faCode || '',
        beCode: first.beCode || '',
        be: first.be || '',
        schedule,
        expectedTotal,
      });
    }
  }
  return out;
}

// ---- Index: everything the summary needs, built once per payload+today ----
export function buildRetailIndex(payload, todayIso, period = 'all', customRange = null) {
  const today = todayIso || dhakaToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  // Due window: MONTH-TO-DATE [monthStart, today] — the retail app's
  // default view (see the header note). monthEndIso is NOT used for
  // dues any more.
  const week = weekWindowIso(today);
  const records = payload.records || [];
  const duePolicies = payload.duePolicies || [];
  const producers = payload.producers || [];
  const directory = payload.producerDirectory || [];

  // Period window for the BUSINESS aggregates (PR row `date`, ISO
  // strings — string compare is exact). 'all' = no filtering, the
  // index is identical to the pre-filter build. Due / persistency /
  // active-FA computation below always uses the full `records`.
  const periodWindow = periodDateWindow(period, today, customRange);
  const businessRecords = periodWindow
    ? records.filter((r) => r.date >= periodWindow.start && r.date <= periodWindow.end)
    : records;

  // Directory lookups (retail producerInfo / canonicalFA).
  const dirByCode = new Map(directory.map((d) => [String(d.code), d]));
  const producerInfo = (code) => dirByCode.get(String(code)) || null;
  const canonicalFA = (code) => {
    const i = producerInfo(code);
    if (!i) return directory.length ? '' : String(code || '');
    return i.ownerTier === 'FA' ? i.ownerCode : '';
  };

  // Owners (alias-resolved people) + the reporting tree from parentOwnerCode.
  // Orphan ancestors are SKIPPED (spec §5): the parent is the nearest REAL
  // ancestor above; an owner whose whole chain is orphan is a root.
  const owners = new Map();
  for (const d of directory) {
    if (!owners.has(d.ownerCode)) {
      owners.set(d.ownerCode, { code: d.ownerCode, tier: d.ownerTier, name: d.ownerName, parent: null });
    }
  }
  const rowsOfOwner = new Map();
  for (const d of directory) {
    if (!rowsOfOwner.has(d.ownerCode)) rowsOfOwner.set(d.ownerCode, []);
    rowsOfOwner.get(d.ownerCode).push(d);
  }
  for (const [code, owner] of owners) {
    const rows = rowsOfOwner.get(code) || [];
    const ownTierRow = rows.find((r) => r.tier === owner.tier) || rows[0];
    let par = ownTierRow ? ownTierRow.parentOwnerCode || '' : '';
    let guard = 0;
    while (par && guard++ < 12) {
      if (par === code) {
        par = '';
        break;
      }
      const pOwner = owners.get(par);
      if (!pOwner) {
        par = '';
        break;
      }
      if (isOrphanCode(par) || isOrphanName(pOwner.name)) {
        const pRows = rowsOfOwner.get(par) || [];
        const pTierRow = pRows.find((r) => r.tier === pOwner.tier) || pRows[0];
        par = pTierRow ? pTierRow.parentOwnerCode || '' : '';
        continue;
      }
      break;
    }
    owner.parent = par || null;
  }
  const children = new Map();
  for (const [code, owner] of owners) {
    if (owner.parent && owners.has(owner.parent)) {
      if (!children.has(owner.parent)) children.set(owner.parent, []);
      children.get(owner.parent).push(code);
    }
  }
  const subtreeOf = (code) => {
    const out = new Set([code]);
    const stack = [code];
    while (stack.length) {
      const c = stack.pop();
      for (const k of children.get(c) || []) {
        if (!out.has(k)) {
          out.add(k);
          stack.push(k);
        }
      }
    }
    return out;
  };

  // Roster producers + resolved BE (retail pdResolveBE — beSource wins).
  const producersByCode = new Map(producers.map((p) => [String(p.code), p]));
  const resolveBE = (prod) => {
    if (!prod) return '';
    const raw = String(prod.beCode || '').trim();
    if (prod.beSource) {
      return !raw || isOrphanBE(raw, prod.be) ? '' : raw;
    }
    if (raw && !isOrphanBE(raw, prod.be)) return raw;
    return '';
  };
  const faByCode = new Set(producers.map((p) => String(p.code)));

  // Row bucketing (retail pdComputeAgg bucketFor, exact):
  // canonical FA in the tree -> FA bucket; else a real non-FA leader ->
  // direct bucket keyed by row BE + leader; else the BE residual.
  const emptyBucket = () => ({ total: 0, fycp: 0, new: 0, deferred: 0, renewal: 0, policies: new Set() });
  const addToBucket = (b, r) => {
    b.total += num(r.total);
    b.fycp += num(r.fycp);
    b.new += num(r.new);
    b.deferred += num(r.deferred);
    b.renewal += num(r.renewal);
    if (isNewType(r) && r.policy) b.policies.add(String(r.policy));
  };
  const faBuckets = new Map();
  const directBuckets = new Map(); // `${be}|${ownerCode}`
  const residualBuckets = new Map(); // be ('' = orphan)
  for (const r of businessRecords) {
    const fa = canonicalFA(r.faCode);
    if (fa && faByCode.has(fa)) {
      if (!faBuckets.has(fa)) faBuckets.set(fa, emptyBucket());
      addToBucket(faBuckets.get(fa), r);
      continue;
    }
    const info = producerInfo(r.faCode);
    const be = !r.beCode || isOrphanBE(r.beCode, r.be) ? '' : String(r.beCode);
    if (
      info &&
      info.ownerTier &&
      info.ownerTier !== 'FA' &&
      !isOrphanCode(info.ownerCode) &&
      !isOrphanName(info.ownerName)
    ) {
      const k = `${be}|${info.ownerCode}`;
      if (!directBuckets.has(k)) directBuckets.set(k, emptyBucket());
      addToBucket(directBuckets.get(k), r);
      continue;
    }
    if (!residualBuckets.has(be)) residualBuckets.set(be, emptyBucket());
    addToBucket(residualBuckets.get(be), r);
  }

  // BE totals via the tree rollup (retail-faithful): FA buckets by the
  // FA's RESOLVED BE + direct buckets by row BE. (Row-beCode totals differ
  // slightly — rows whose row BE is stale vs the FA's resolved BE.)
  const beTotals = new Map();
  const addBe = (be, bucket) => {
    if (!be) return;
    if (!beTotals.has(be)) beTotals.set(be, emptyBucket());
    const t = beTotals.get(be);
    t.total += bucket.total;
    t.fycp += bucket.fycp;
    t.new += bucket.new;
    t.deferred += bucket.deferred;
    t.renewal += bucket.renewal;
    for (const p of bucket.policies) t.policies.add(p);
  };
  for (const [fa, bucket] of faBuckets) {
    addBe(resolveBE(producersByCode.get(fa)), bucket);
  }
  for (const [key, bucket] of directBuckets) {
    addBe(key.split('|')[0], bucket);
  }
  // BE names (from any record carrying the code).
  const beNames = new Map();
  for (const r of records) {
    const be = !r.beCode || isOrphanBE(r.beCode, r.be) ? '' : String(r.beCode);
    if (be && r.be && !beNames.has(be)) beNames.set(be, r.be);
  }
  for (const [be] of beTotals) {
    if (!beNames.has(be)) beNames.set(be, be);
  }

  // Ever-sold set (the retail app's headline Active-FA KPI): canonical
  // FAs with ANY PR row, regardless of date. The retail app computes
  // this from its producers' `activity` field ('Active' = any row);
  // the Hub rebuilds the same set from the records so it does not
  // depend on the producers list's completeness.
  const everSet = new Set();
  for (const r of records) {
    const c = canonicalFA(r.faCode);
    if (c) everSet.add(c);
  }

  // Due sheet lookups (retail pdDueSheetByPolicy / pdDueRowBE).
  const dueByPolicy = new Map();
  for (const d of duePolicies) {
    if (d.policy) dueByPolicy.set(String(d.policy), d);
  }
  const realBESet = new Set();
  for (const p of producers) {
    const be = resolveBE(p);
    if (be) realBESet.add(be);
  }
  const dueRowBE = (d) => {
    const fa = canonicalFA(d.faCode);
    if (fa) {
      const p = producersByCode.get(fa);
      if (p) return resolveBE(p);
    }
    const init = String(d.beCode || '').trim();
    if (!init || isOrphanBE(init, '')) return '';
    return realBESet.has(init) ? init : '';
  };

  // Direct buckets grouped by owner (for subtree totals).
  const directByOwner = new Map();
  for (const [key, bucket] of directBuckets) {
    const owner = key.split('|')[1];
    if (!directByOwner.has(owner)) directByOwner.set(owner, []);
    directByOwner.get(owner).push(bucket);
  }

  // Ledgers as of today (for the Due Premium ledger fallback — the
  // fallback only counts instalments inside the MTD window, so the
  // schedule never needs to run past today).
  const ledgers = buildLedgers(records, today);

  // Org totals (independent of scoping — the Admin / reconciliation base).
  const orgBucket = emptyBucket();
  for (const r of businessRecords) addToBucket(orgBucket, r);

  return {
    payload,
    today,
    period,
    periodWindow,
    dueStart: monthStart,
    dueEnd: today,
    weekStart: week.start,
    weekEnd: week.end,
    records,
    duePolicies,
    producers,
    directory,
    owners,
    children,
    subtreeOf,
    producersByCode,
    resolveBE,
    producerInfo,
    canonicalFA,
    faBuckets,
    directBuckets,
    directByOwner,
    residualBuckets,
    beTotals,
    beNames,
    realBESet,
    everSet,
    dueByPolicy,
    dueRowBE,
    ledgers,
    orgBucket,
  };
}

// ---- User resolution (spec §4) ----
function resolveUser(index, employeeId) {
  const id = String(employeeId || '').trim();
  if (!id) return { kind: 'none', code: null, tier: null, name: null };
  const info = index.producerInfo(id);
  if (info) {
    // A raw code (or an owner code — same lookup) resolves to its owner.
    // An orphan owner is NOT a person: the user has no usable code.
    if (isOrphanCode(info.ownerCode) || isOrphanName(info.ownerName)) {
      return { kind: 'none', code: null, tier: null, name: null };
    }
    return { kind: 'field', code: info.ownerCode, tier: info.ownerTier, name: info.ownerName };
  }
  // BE codes are alphabetic (NZI, MNM, …) and are not in the directory.
  // A BE user is recognised by their BE code (spec §4.2; the sign-in
  // identifier itself is still an OPEN item with Mahadi).
  const upper = id.toUpperCase();
  if (index.beTotals.has(upper) || index.realBESet.has(upper)) {
    return { kind: 'be', code: upper, tier: 'BE', name: index.beNames.get(upper) || upper };
  }
  return { kind: 'none', code: null, tier: null, name: null };
}

// ---- Scope: the visible sets for a (user, role) pair (spec §5–§6) ----
// The JWT role is authoritative for ACCESS (the Hub's auth model): an
// Employee sees own only even if the tree shows children under them
// (inconsistent data fails closed). Team Lead / Manager see own + subtree.
// Admin sees org-wide. The visible SET is the same rule for Team Lead and
// Manager (own + subtree) — only the label differs.
function buildScope(index, user, role) {
  if (role === 'admin') {
    // The FA universe is ALL roster FAs (the tree), not just FAs with
    // rows — an FA with no sales yet still counts in "X of Y".
    const faSet = new Set();
    for (const [code, owner] of index.owners) {
      if (owner.tier === 'FA') faSet.add(code);
    }
    return {
      kind: 'org',
      scopeLabel: 'org',
      faSet,
      leaderSet: new Set(index.owners.keys()),
      beCode: null,
    };
  }
  if (user.kind === 'be') {
    const faSet = new Set();
    for (const [code, owner] of index.owners) {
      if (owner.tier !== 'FA') continue;
      if (index.resolveBE(index.producersByCode.get(code)) === user.code) faSet.add(code);
    }
    const leaderSet = new Set();
    for (const [code, owner] of index.owners) {
      if (owner.tier === 'FA') continue;
      const st = index.subtreeOf(code);
      for (const fa of st) {
        if (faSet.has(fa)) {
          leaderSet.add(code);
          break;
        }
      }
    }
    return { kind: 'be', scopeLabel: 'subtree', faSet, leaderSet, beCode: user.code };
  }
  if (user.kind !== 'field') {
    return { kind: 'none', scopeLabel: 'own', faSet: new Set(), leaderSet: new Set(), beCode: null };
  }
  if (role === 'employee') {
    const faSet = new Set();
    if (user.tier === 'FA') faSet.add(user.code);
    return {
      kind: 'own',
      scopeLabel: 'own',
      faSet,
      leaderSet: new Set([user.code]),
      beCode: null,
    };
  }
  // team_lead / manager: own + subtree.
  const subtree = index.subtreeOf(user.code);
  const faSet = new Set();
  const leaderSet = new Set();
  for (const code of subtree) {
    const owner = index.owners.get(code);
    if (!owner) continue;
    if (owner.tier === 'FA') faSet.add(code);
    else leaderSet.add(code);
  }
  return {
    kind: 'field',
    scopeLabel: role === 'team_lead' ? 'team' : 'subtree',
    faSet,
    leaderSet,
    beCode: null,
  };
}

// ---- KPI computation over a scope ----
function sumBuckets(buckets) {
  const out = { total: 0, fycp: 0, new: 0, deferred: 0, renewal: 0, policies: new Set() };
  for (const b of buckets) {
    out.total += b.total;
    out.fycp += b.fycp;
    out.new += b.new;
    out.deferred += b.deferred;
    out.renewal += b.renewal;
    for (const p of b.policies) out.policies.add(p);
  }
  return out;
}

function scopeBusiness(index, scope) {
  if (scope.kind === 'org') {
    return {
      total: index.orgBucket.total,
      fycp: index.orgBucket.fycp,
      new: index.orgBucket.new,
      deferred: index.orgBucket.deferred,
      renewal: index.orgBucket.renewal,
      policies: index.orgBucket.policies.size,
    };
  }
  const buckets = [];
  for (const fa of scope.faSet) {
    const b = index.faBuckets.get(fa);
    if (b) buckets.push(b);
  }
  for (const [key, b] of index.directBuckets) {
    const [be, owner] = key.split('|');
    if (scope.kind === 'be') {
      if (be === scope.beCode) buckets.push(b);
    } else if (scope.leaderSet.has(owner)) {
      buckets.push(b);
    }
  }
  const s = sumBuckets(buckets);
  return {
    total: s.total,
    fycp: s.fycp,
    new: s.new,
    deferred: s.deferred,
    renewal: s.renewal,
    policies: s.policies.size,
  };
}

// Due-row visibility: the FA is in scope, or the row is a leader-direct
// row of a visible leader, or (BE scope) the row resolves to the BE.
function dueRowVisible(index, scope, d) {
  if (scope.kind === 'org') return true;
  const fa = index.canonicalFA(d.faCode);
  if (fa && scope.faSet.has(fa)) return true;
  const info = index.producerInfo(d.faCode);
  if (info && info.ownerTier && info.ownerTier !== 'FA' && scope.leaderSet.has(info.ownerCode)) {
    return true;
  }
  if (scope.kind === 'be' && index.dueRowBE(d) === scope.beCode) return true;
  return false;
}

// Due Premium, MONTH-TO-DATE (retail pdDueRowsForWindow with the MTD
// default preset): sheet Inforce rows whose nextDue falls in
// [dueStart, dueEnd] = [monthStart, today] (one instalment = Premium),
// + the ledger fallback for sheet-absent policies (unpaid only, same
// window). Dues later in the month and the overdue backlog are NOT in
// the figure — that is the retail app's default view, not a Hub
// omission (reconciled 2026-11-20).
function scopeDuePremium(index, scope) {
  const { dueStart, dueEnd } = index;
  let total = 0;
  const policies = new Set();
  for (const d of index.duePolicies) {
    if (!d.policy || !d.nextDue) continue;
    if (String(d.status || '').trim().toLowerCase() !== 'inforce') continue;
    if (d.nextDue < dueStart || d.nextDue > dueEnd) continue;
    if (!dueRowVisible(index, scope, d)) continue;
    const amount = num(d.premium);
    if (amount <= 0) continue;
    total += amount;
    policies.add(String(d.policy));
  }
  for (const led of index.ledgers) {
    if (index.dueByPolicy.has(String(led.policy))) continue;
    if (!dueRowVisible(index, scope, { faCode: led.faCode, beCode: led.beCode })) continue;
    let amount = 0;
    for (const s of led.schedule) {
      if (s.dueDate >= dueStart && s.dueDate <= dueEnd) amount += num(s.unpaid);
    }
    if (amount <= 0.005) continue;
    total += amount;
    policies.add(String(led.policy));
  }
  return { total, policies: policies.size };
}

// Dues this week: the same Inforce dues inside the current Bangladesh
// calendar week (Sunday–Saturday, index.weekStart/weekEnd) — the
// Due Premium definition with a week window, ledger fallback
// included, so the week figure is a true subset of the MTD figure.
// Count = distinct policies.
function scopeDuesThisWeek(index, scope) {
  const { weekStart, weekEnd } = index;
  let amount = 0;
  const policies = new Set();
  for (const d of index.duePolicies) {
    if (!d.policy || !d.nextDue) continue;
    if (String(d.status || '').trim().toLowerCase() !== 'inforce') continue;
    if (d.nextDue < weekStart || d.nextDue > weekEnd) continue;
    if (!dueRowVisible(index, scope, d)) continue;
    const premium = num(d.premium);
    if (premium <= 0) continue;
    amount += premium;
    policies.add(String(d.policy));
  }
  for (const led of index.ledgers) {
    if (index.dueByPolicy.has(String(led.policy))) continue;
    if (!dueRowVisible(index, scope, { faCode: led.faCode, beCode: led.beCode })) continue;
    let ledgerAmount = 0;
    for (const s of led.schedule) {
      if (s.dueDate >= weekStart && s.dueDate <= weekEnd) ledgerAmount += num(s.unpaid);
    }
    if (ledgerAmount <= 0.005) continue;
    amount += ledgerAmount;
    policies.add(String(led.policy));
  }
  return { count: policies.size, amount, weekStart, weekEnd };
}

// The Home Due widget's two due-row lists (Mahadi 2026-11-20: the
// widget shows Overdue and Upcoming side by side, 3 rows each):
// Inforce rows, scoped, split by the Dhaka today — Overdue is
// nextDue BEFORE today, earliest first (most overdue first);
// Upcoming is nextDue TODAY or later, earliest first (nearest
// first). Same rows scopeDuePremium uses (dueRowVisible), same
// policy tie-break so the order is deterministic. Each row carries
// ONLY the owner name, the due date and the premium: no policy
// number, no mobile (the payload has no mobile field anywhere —
// verified on the full payload, 0 occurrences).
function scopeDueRowLists(index, scope) {
  const { today } = index;
  const rows = [];
  for (const d of index.duePolicies) {
    if (!d.policy || !d.nextDue) continue;
    if (String(d.status || '').trim().toLowerCase() !== 'inforce') continue;
    if (!dueRowVisible(index, scope, d)) continue;
    const premium = num(d.premium);
    if (premium <= 0) continue;
    rows.push({ owner: String(d.owner || ''), nextDue: d.nextDue, premium, policy: String(d.policy) });
  }
  rows.sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : a.policy < b.policy ? -1 : 1));
  const strip = (list) => list.slice(0, 3).map(({ owner, nextDue, premium }) => ({ owner, nextDue, premium }));
  return {
    overdue: strip(rows.filter((r) => r.nextDue < today)),
    upcoming: strip(rows.filter((r) => r.nextDue >= today)),
  };
}

// Persistency, cumulative through today (retail pdPersistRows, cumulative):
// conventional only, Death excluded entirely, T-series excluded outright.
function scopePersistency(index, scope) {
  const { today } = index;
  let all = 0;
  let inf = 0;
  for (const d of index.duePolicies) {
    if (isTseries(d.policy)) continue;
    if (String(d.status || '').trim().toLowerCase() === 'death') continue;
    let inCohort;
    if (d.commDate) inCohort = d.commDate <= today;
    else if (d.commYear != null && d.commMonth != null) {
      inCohort = `${d.commYear}-${String(d.commMonth).padStart(2, '0')}-01` <= today;
    } else {
      inCohort = false;
    }
    if (!inCohort) continue;
    if (!dueRowVisible(index, scope, d)) continue;
    all++;
    if (String(d.status || '').trim().toLowerCase() === 'inforce') inf++;
  }
  if (all === 0) return null;
  return { pct: (inf / all) * 100, inf, all };
}

// Active FAs (the retail app's headline KPI): FAs in scope who have
// EVER sold (any PR row), as a share of the FA universe. The retail
// app's producers `activity` field is 'Active' exactly when the
// producer has any row; everSet rebuilds that set from the records.
function scopeActiveFas(index, scope) {
  let active = 0;
  for (const fa of scope.faSet) {
    if (index.everSet.has(fa)) active++;
  }
  return { active, total: scope.faSet.size };
}

// Subtree totals for one node (FA buckets + direct buckets of its leaders).
function nodeSubtreeTotals(index, code) {
  const st = index.subtreeOf(code);
  const buckets = [];
  for (const c of st) {
    const f = index.faBuckets.get(c);
    if (f) buckets.push(f);
    for (const b of index.directByOwner.get(c) || []) buckets.push(b);
  }
  const s = sumBuckets(buckets);
  return { total: s.total, policies: s.policies.size };
}

// Leaderboard (spec §6.4): the viewer's direct reports, ranked by Total
// Premium (subtree totals). Admin sees Top-5 BEs. Employees see none.
function scopeLeaderboard(index, scope, user, role) {
  if (role === 'admin') {
    const entries = [...index.beTotals.entries()]
      .map(([code, b]) => ({
        name: index.beNames.get(code) || code,
        premium: b.total,
        policies: b.policies.size,
      }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 5);
    return { kind: 'bes', entries };
  }
  if (role === 'employee' || user.kind === 'none') {
    return { kind: 'none', entries: [] };
  }
  if (user.kind === 'be') {
    // Direct reports of a BE = the GM roots whose subtree holds FAs of
    // this BE, ranked by the subtree total RESTRICTED to this BE (FA
    // buckets resolving to the BE + direct buckets with this row BE).
    const entries = [];
    for (const [code, owner] of index.owners) {
      if (owner.tier !== 'GM' || owner.parent) continue;
      const st = index.subtreeOf(code);
      let hasFa = false;
      for (const fa of st) {
        if (scope.faSet.has(fa)) {
          hasFa = true;
          break;
        }
      }
      if (!hasFa) continue;
      const buckets = [];
      for (const fa of st) {
        if (scope.faSet.has(fa)) {
          const b = index.faBuckets.get(fa);
          if (b) buckets.push(b);
        }
      }
      for (const [key, b] of index.directBuckets) {
        const [be, leader] = key.split('|');
        if (be === scope.beCode && st.has(leader)) buckets.push(b);
      }
      const s = sumBuckets(buckets);
      entries.push({ name: owner.name, premium: s.total, policies: s.policies.size });
    }
    entries.sort((a, b) => b.premium - a.premium);
    return { kind: 'reports', entries: entries.slice(0, 5) };
  }
  const kids = index.children.get(user.code) || [];
  const entries = kids
    .map((code) => {
      const owner = index.owners.get(code);
      const t = nodeSubtreeTotals(index, code);
      return { name: owner ? owner.name : code, premium: t.total, policies: t.policies };
    })
    .sort((a, b) => b.premium - a.premium)
    .slice(0, 5);
  return { kind: 'reports', entries };
}

// Unassigned line (spec §6.5): residual rows (FA unplaceable, not a direct
// bucket) within the visible scope. For field scopes the residual is never
// in a subtree, so only Admin (all residuals) and BE users (their BE's
// residual) ever see it. Never merged into a real person's total.
function scopeUnassigned(index, scope) {
  if (scope.kind === 'org') {
    const s = sumBuckets([...index.residualBuckets.values()]);
    if (s.total <= 0 && s.policies.size === 0) return null;
    return { premium: s.total, policies: s.policies.size };
  }
  if (scope.kind === 'be') {
    const b = index.residualBuckets.get(scope.beCode);
    if (!b || (b.total <= 0 && b.policies.size === 0)) return null;
    return { premium: b.total, policies: b.policies.size };
  }
  return null;
}

/**
 * The Dashboard summary for one user. `todayIso` is the Dhaka date
 * (YYYY-MM-DD); pass it explicitly in tests for determinism. `period`
 * filters the business aggregates (default 'all' = no filtering);
 * for 'custom', pass the validated { start, end } range.
 */
export function summarizeRetail(payload, user, todayIso, period = 'all', customRange = null) {
  const index = buildRetailIndex(payload, todayIso, period, customRange);
  return summarizeWithIndex(index, user);
}

export function summarizeWithIndex(index, user) {
  const role = user.role;
  const resolved = resolveUser(index, user.employeeId);
  const scope = buildScope(index, resolved, role);
  const business = scopeBusiness(index, scope);
  const due = scopeDuePremium(index, scope);
  const duesThisWeek = scopeDuesThisWeek(index, scope);
  const dueRowLists = scopeDueRowLists(index, scope);
  const persistency = scopePersistency(index, scope);
  const activeFas = scopeActiveFas(index, scope);
  const leaderboard = scopeLeaderboard(index, scope, resolved, role);
  const unassigned = scopeUnassigned(index, scope);

  const empty =
    business.total === 0 &&
    business.policies === 0 &&
    due.total === 0 &&
    persistency === null &&
    activeFas.total === 0;
  const emptyReason = !empty
    ? null
    : resolved.kind === 'none' && role !== 'admin'
      ? 'no-code'
      : 'no-rows';

  const syncedMs = (() => {
    const lu = index.payload?.sync?.lastUpdated;
    if (lu) {
      const ms = Date.parse(lu);
      if (Number.isFinite(ms)) return ms;
    }
    return Date.now();
  })();

  return {
    scope: scope.scopeLabel,
    role,
    period: index.period || 'all',
    periodWindow: index.periodWindow || null,
    userCode: resolved.code,
    userName: resolved.name,
    userTier: resolved.tier,
    empty,
    emptyReason,
    totalPremium: business.total,
    deferredRatio: business.total > 0 ? (business.deferred / business.total) * 100 : null,
    renewalRatio: business.total > 0 ? (business.renewal / business.total) * 100 : null,
    fycp: business.fycp,
    // Raw New / Deferred sums (FYCP = new + deferred) — the Home FYCP
    // card's sub-text. Same columns the ratios above are computed from.
    newPremium: business.new,
    deferredPremium: business.deferred,
    policies: business.policies,
    duePremium: due.total,
    duePolicies: due.policies,
    dueMonth: index.today.slice(0, 7),
    // The MTD window Due Premium covers, so the UI can show it.
    dueWindow: { start: index.dueStart, end: index.dueEnd },
    // This week's dues (Bangladesh calendar week) + the Home Due
    // widget's two due-row lists (3 most overdue, 3 nearest
    // upcoming). Both are period-independent snapshots, like Due Premium.
    duesThisWeek,
    dueRowsOverdue: dueRowLists.overdue,
    dueRowsUpcoming: dueRowLists.upcoming,
    persistency,
    activeFas,
    leaderboard,
    unassigned,
    syncedAt: syncedMs,
    periodEnd: index.payload?.periodEnd || null,
  };
}
