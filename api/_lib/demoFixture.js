/**
 * Synthetic demo retail slice for the fictional 999xxxx demo users.
 *
 * DEMO DECISION (spec §10, option b — synthetic rows): the demo accounts
 * match no real retail rows, so pure scoping would show them an empty
 * Dashboard. Instead the proxy serves this small synthetic slice — clearly
 * labelled DEMO in the UI — so each role's scoped view is reviewable on
 * the preview without ever exposing real policy data to the public demo
 * login. NO real rows are used (option a, a demo mapping to a real
 * subtree, was rejected for exactly that reason).
 *
 * GATING: the proxy serves this ONLY when HUB_DEMO_FIXTURE=true AND the
 * caller's sub starts with '999'. NO Vercel-env check — this project's
 * deployments run on the production target, so VERCEL_ENV is always
 * 'production' here and such a check silently disables the fixture
 * (live bug 2026-11-20). The real production lock is the vite.config
 * build guard: a HUB_BUILD_TARGET=production build FAILS with the flag
 * set.
 *
 * The slice goes through the SAME summarizer as live data, so scoping is
 * exercised identically. All dates are relative to `todayIso` so the
 * fixture never goes stale (Due Premium = this month, Active FA = last
 * 6 months). Amounts are round numbers with hand-computed expectations —
 * scripts/qa-retail-live.mjs asserts them exactly:
 *
 * Tree (BE 'DMO'): 9990003 (GM) -> 9990002 (UM) -> 9990001, 9990011,
 * 9990012 (FAs); 9990003 -> 9990005 (UM) -> 9990013 (FA).
 * Records: 9990001 67,000 (3 pol) · 9990011 57,000 (2 pol) · 9990012
 * 15,000 (1 pol) · 9990013 70,000 (1 pol) · 9990002 direct 25,000 (1
 * pol) · orphan row 7,000 (1 pol). Org total 2,41,000 · FYCP 2,33,000 ·
 * 9 policies · Unassigned 7,000 · DMO 2,34,000 (8 pol).
 * Due this month: sheet 17,000 (3 pol) + T-series ledger fallback 21,000
 * (T9001 12,000 + T9002 9,000) = 38,000 (5 pol). Conventional policies
 * are all sheet-covered (as in the real data — only T-series are
 * sheet-absent), so the fallback is purely T-series. Persistency 8/9 =
 * 88.9% org-wide. Active FAs: 9990012 has only a 300-day-old sale -> 3
 * of 4 org-wide.
 *
 * Period spread (pinned to 2026-11-20 in the QA): D1002 sits 100 days
 * back (in 6m, out of 3m) so the periods differ visibly — org totals:
 * today 35,000 (1 pol) · this-month 113,000 (2 pol) · 3m 185,000 (5
 * pol) · 6m 205,000 (6 pol) · this-year 241,000 (9 pol, = all time).
 * Due / persistency / active FAs are window-fixed and never move with
 * the period. D1001's two receipts are dated TODAY (the New was 30
 * days back, the Deferred 10 days back) so the Today default shows
 * non-zero business for every demo role (9990001 sits in every
 * scope); both records stay inside 3m/6m/this-year/all, so only
 * this-month moved (83,000 → 113,000, 1 → 2 pol).
 */
import { addMonthsIso } from './retailSummary.js';

function addDaysIso(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgo(today, n) {
  return addDaysIso(today, -n);
}

function record({
  policy,
  faCode,
  beCode = 'DMO',
  be = 'Demo BE',
  date,
  type = 'New',
  term = '10',
  mode = 'Monthly',
  product = 'Shanta Endowment (With Profit) Plan',
  amount,
}) {
  const isNew = type === 'New';
  const isDeferred = type === 'Deferred';
  const isRenewal = /^\d+R$/i.test(type);
  const premium = amount;
  return {
    policy,
    owner: 'Demo Customer',
    receipt: `R-${policy}`,
    date,
    faCode,
    fa: '',
    zone: 'DHAKA',
    umCode: '',
    um: '',
    bmCode: '',
    bm: '',
    agmCode: '',
    agm: '',
    dgmCode: '',
    dgm: '',
    gmCode: '',
    gm: '',
    beCode,
    be,
    type,
    term,
    mode,
    premium,
    month: '',
    year: String(new Date(`${date}T00:00:00Z`).getUTCFullYear()),
    product,
    sbu: false,
    new: isNew ? premium : 0,
    deferred: isDeferred ? premium : 0,
    renewal: isRenewal ? premium : 0,
    // FYCP = New + Deferred (the retail fallback: FYCP column empty ->
    // new + deferred). Renewal rows carry FYCP 0.
    fycp: isRenewal ? 0 : premium,
    total: premium,
    category: /^T/i.test(policy) ? 'Term' : 'Conventional',
  };
}

function dueRow({ policy, faCode, nextDue, premium, status = 'Inforce', commDate }) {
  const [y, m] = commDate.split('-').map(Number);
  return {
    policy,
    owner: 'Demo Customer',
    nextDue,
    product: 'Shanta Endowment (With Profit) Plan',
    term: '10',
    dueInstl: 0,
    premium,
    duePrem: 0,
    mode: 'Monthly',
    status,
    faCode,
    beCode: 'DMO',
    premiumReceived: 0,
    lapseTiming: 'Regular',
    commYear: y,
    commMonth: m,
    commDate,
  };
}

export function buildDemoPayload(todayIso) {
  const today = todayIso;
  const month = today.slice(0, 7);
  const nextMonth = addMonthsIso(`${month}-01`, 1).slice(0, 7);
  const lastMonth = addMonthsIso(`${month}-01`, -1).slice(0, 7);
  // T9002's first New receipt: its +6-month ledger instalment lands on
  // the 15th of THIS month, so the ledger fallback always contributes.
  const t9002NewDate = addMonthsIso(`${month}-15`, -6);
  const commDate = '2025-06-15';

  const producerDirectory = [
    { code: '9990003', name: 'Demo Manager', tier: 'GM', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990003', ownerName: 'Demo Manager', ownerTier: 'GM', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '', parentOwnerTier: '' },
    { code: '9990002', name: 'Demo Team Lead', tier: 'UM', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990002', ownerName: 'Demo Team Lead', ownerTier: 'UM', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990003', parentOwnerTier: 'GM' },
    { code: '9990005', name: 'Demo UM Five', tier: 'UM', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990005', ownerName: 'Demo UM Five', ownerTier: 'UM', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990003', parentOwnerTier: 'GM' },
    { code: '9990001', name: 'Demo Agent', tier: 'FA', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990001', ownerName: 'Demo Agent', ownerTier: 'FA', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990002', parentOwnerTier: 'UM' },
    { code: '9990011', name: 'Demo FA Eleven', tier: 'FA', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990011', ownerName: 'Demo FA Eleven', ownerTier: 'FA', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990002', parentOwnerTier: 'UM' },
    { code: '9990012', name: 'Demo FA Twelve', tier: 'FA', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990012', ownerName: 'Demo FA Twelve', ownerTier: 'FA', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990002', parentOwnerTier: 'UM' },
    { code: '9990013', name: 'Demo FA Thirteen', tier: 'FA', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990013', ownerName: 'Demo FA Thirteen', ownerTier: 'FA', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990005', parentOwnerTier: 'UM' },
  ];

  const producers = ['9990001', '9990011', '9990012', '9990013'].map((code) => ({
    code,
    aliases: [code],
    name: producerDirectory.find((d) => d.code === code).name,
    beCode: 'DMO',
    be: 'Demo BE',
    beSource: 'recruit',
    district: '',
    designation: 'FA',
    activity: 'Active',
    reason: '',
    joined: '2025-01-10',
    lastPremiumDate: '',
    lastPremiumMonth: '',
  }));

  const records = [
    // 9990001: 30,000 + 5,000 + 20,000 + T9001 12,000 = 67,000 (3 pol)
    // D1001's receipts are dated TODAY so the Today default is
    // non-zero for every role (see the header comment). D1001 is
    // sheet-covered, so moving them cannot touch the ledger fallback.
    record({ policy: 'D1001', faCode: '9990001', date: daysAgo(today, 0), type: 'New', amount: 30000 }),
    record({ policy: 'D1001', faCode: '9990001', date: daysAgo(today, 0), type: 'Deferred', amount: 5000 }),
    // D1002 sits 100 days back: inside the 6m window, outside 3m, so
    // the two periods differ (see the header comment). It is
    // sheet-covered, so moving it cannot touch the ledger fallback.
    record({ policy: 'D1002', faCode: '9990001', date: daysAgo(today, 100), type: 'New', amount: 20000 }),
    record({ policy: 'T9001', faCode: '9990001', date: daysAgo(today, 200), type: 'New', term: '1', mode: 'Half-Yearly', product: 'Shanta Assurance Plan', amount: 12000 }),
    // 9990011: 40,000 + 8,000 + T9002 9,000 = 57,000 (2 pol)
    record({ policy: 'D1011', faCode: '9990011', date: daysAgo(today, 20), type: 'New', amount: 40000 }),
    record({ policy: 'D1011', faCode: '9990011', date: daysAgo(today, 5), type: '2R', amount: 8000 }),
    record({ policy: 'T9002', faCode: '9990011', date: t9002NewDate, type: 'New', term: '1', mode: 'Half-Yearly', product: 'Shanta Assurance Plan', amount: 9000 }),
    // 9990012: only an old sale (300 days) -> inactive in the 6-month window
    record({ policy: 'D1012', faCode: '9990012', date: daysAgo(today, 300), type: 'New', amount: 15000 }),
    // 9990013: 60,000 + 10,000 = 70,000 (1 pol)
    record({ policy: 'D1013', faCode: '9990013', date: daysAgo(today, 15), type: 'New', amount: 60000 }),
    record({ policy: 'D1013', faCode: '9990013', date: daysAgo(today, 3), type: 'Deferred', amount: 10000 }),
    // 9990002 direct sale (leader direct bucket): 25,000 (1 pol)
    record({ policy: 'D1005', faCode: '9990002', date: daysAgo(today, 25), type: 'New', amount: 25000 }),
    // Orphan row: unplaceable FA + SLI BE -> the Unassigned line (Admin only)
    record({ policy: 'D1999', faCode: '1101010101001', beCode: 'SLI', be: 'Shanta Life Insurance PLC', date: daysAgo(today, 40), type: 'New', amount: 7000 }),
  ];

  const duePolicies = [
    dueRow({ policy: 'D1001', faCode: '9990001', nextDue: `${month}-10`, premium: 5000, commDate }),
    dueRow({ policy: 'D1011', faCode: '9990011', nextDue: `${month}-20`, premium: 8000, commDate }),
    dueRow({ policy: 'D1013', faCode: '9990013', nextDue: `${nextMonth}-05`, premium: 6000, commDate }),
    dueRow({ policy: 'D1012', faCode: '9990012', nextDue: `${lastMonth}-10`, premium: 3000, commDate }),
    dueRow({ policy: 'D2001', faCode: '9990013', nextDue: `${month}-12`, premium: 4000, commDate }),
    dueRow({ policy: 'D2002', faCode: '9990001', nextDue: `${month}-15`, premium: 9000, status: 'Death', commDate }),
    dueRow({ policy: 'D2003', faCode: '9990011', nextDue: `${month}-15`, premium: 2000, status: 'Lapse', commDate }),
    // Every conventional policy is sheet-covered (as in the real data),
    // so their ledgers never enter the fallback. Next-month dues: they
    // count in the persistency cohort but not in this month's Due Premium.
    dueRow({ policy: 'D1002', faCode: '9990001', nextDue: `${nextMonth}-08`, premium: 2000, commDate }),
    dueRow({ policy: 'D1005', faCode: '9990002', nextDue: `${nextMonth}-09`, premium: 2500, commDate }),
    dueRow({ policy: 'D1999', faCode: '1101010101001', nextDue: `${nextMonth}-10`, premium: 700, commDate }),
  ];

  return {
    source: 'demo-fixture',
    sheetId: null,
    rowCount: records.length,
    policyCount: 9,
    periodStart: addMonthsIso(today, -12),
    periodEnd: today,
    records,
    duePolicies,
    duePolicyCount: duePolicies.length,
    producerCount: producers.length,
    producers,
    producerDirectory,
    recruitment: [],
    leaderRecruitment: [],
    channelManagers: [],
    sync: { connected: true, lastUpdated: `${today}T00:00:00.000Z`, source: 'demo-fixture' },
  };
}
