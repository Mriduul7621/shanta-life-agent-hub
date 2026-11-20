/**
 * Retail Dashboard — live data + proxy + fixture check (Node, no browser).
 *
 * Usage: `npm run qa:retail-live`.
 *
 * The live-data proof for the Dashboard page: the in-browser QA
 * (scripts/qa-screenshots.mjs) cannot exercise the live fetch because
 * this VM's headless Chrome has no external network and there is no
 * /api/retail-data proxy under file://. This script runs the Hub's OWN
 * production code — the shared summarizer (api/_lib/retailSummary.js)
 * and the proxy handler (api/retail-data.js) — against the real retail
 * endpoint payload from Node, where the fetch works.
 *
 * Sections:
 *  1. Live payload: the retail endpoint answers with the expected shape.
 *  2. Admin summary vs the spec's §12 expected values (tolerance +
 *     drift reporting — receipts sync daily, so values move; a failure
 *     here means either real drift past tolerance or a formula break —
 *     the detail prints the live value so a human can tell which).
 *  3. Independent recomputation: direct sums from the raw payload must
 *     match the summarizer EXACTLY (same payload, no drift possible),
 *     and the bucket partition must reconcile to the org total.
 *  4. Scoping: real UM / FA / BE / GM codes, subtree <= org, the
 *     Employee role failing closed, staff IDs empty with 'no-code'.
 *  5. Demo fixture: the synthetic slice's hand-computed values, exact.
 *     The fixture scenario is PINNED to 2026-11-20 (FIXTURE_TODAY) —
 *     its due expectations depend on instalment dates relative to the
 *     reference day, so pinning keeps them deterministic. The live
 *     sections above use the real current date.
 *  5b. Time-frame filter (fixture, pinned date): each period window
 *     returns exactly the rows inside it (hand-computed values +
 *     independent recomputation from the raw rows), including 'today'
 *     (the new default) and custom ranges; snapshot KPIs
 *     (due / persistency / active FAs) never move with the period;
 *     boundary dates included/excluded correctly; scoping still
 *     correct inside a period.
 *  6. Key match: the DEV public key PEM + kid bundled in the proxy
 *     (api/_lib/verifyJwt.js) must equal the browser's copy
 *     (src/auth/keys.ts) — the two copies must never drift apart.
 *  7. Proxy handler: the real handler, with the retail fetch stubbed to
 *     the live payload and test JWTs signed with an ephemeral keypair —
 *     401 without/a bad token, 200 + correct summary for admin/UM,
 *     demo fixture gating (flag on/off, production env), no raw rows
 *     in any response, payload caching. Period handling: invalid
 *     period -> 400, demo + live paths honour ?period=, two periods
 *     cached separately (one payload fetch, two different summaries);
 *     the default period is Today; custom ranges return exactly the
 *     rows inside them and invalid custom ranges -> 400.
 *  8. Mixed-version tolerance (client): the REAL browser-side client
 *     module (src/data/retailData.ts, via Node type stripping + the
 *     resolve hook in scripts/qa-ts-resolve-hooks.mjs) must accept an
 *     OLD-shape proxy response (no newPremium/deferredPremium) and
 *     default the two fields to 0, on both the fresh-fetch and the
 *     cached paths; other required checks still reject bad shapes.
 *     Also asserts the service-worker cache name is v2.
 *  9. Retail-app reconciliation (stubbed payload): the Due Premium
 *     and Active FA definitions reconciled with the retail app
 *     (2026-11-20, Mahadi) — Due is month-to-date (a due later in
 *     the month is NOT in the figure; `premium` is summed, NOT
 *     `duePrem`), Active FAs is ever-sold (a never-sold FA counts
 *     in the universe but not as active). Proved on a mutated
 *     fixture copy so the expectations are exact.
 *
 * Read-only: one GET to the public retail endpoint, no writes. The proxy
 * section never touches the network (stubbed fetch). Exits non-zero if
 * any check fails.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { summarizeRetail, summarizeWithIndex, buildRetailIndex, dhakaToday } from '../api/_lib/retailSummary.js';
import { buildDemoPayload } from '../api/_lib/demoFixture.js';
import { periodDateWindow } from '../api/_lib/periods.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const RETAIL_URL = 'https://retail-dashboard-zeta.vercel.app/api/sales-data';
const FIXTURE_TODAY = '2026-11-20';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const fmt = (n) => `৳${Math.round(n).toLocaleString('en-IN')}`;
const withinPct = (actual, expected, pct) => Math.abs(actual - expected) <= (expected * pct) / 100;
const num = (v) => Number(v) || 0;
const isNewType = (r) => String(r.type || '').trim().toLowerCase() === 'new';

// ---- 1. Live payload ----
const liveRes = await fetch(RETAIL_URL, { signal: AbortSignal.timeout(60000) });
check('retail endpoint: HTTP 200', liveRes.ok, `HTTP ${liveRes.status}`);
const payload = await liveRes.json();
check('retail payload: records present', Array.isArray(payload.records) && payload.records.length > 1000, `${payload.records?.length} rows`);
check(
  'retail payload: duePolicies + producerDirectory present',
  Array.isArray(payload.duePolicies) && payload.duePolicies.length > 100 && Array.isArray(payload.producerDirectory) && payload.producerDirectory.length > 100,
  `due ${payload.duePolicies?.length} · directory ${payload.producerDirectory?.length}`,
);
console.log(`INFO  payload lastUpdated: ${payload.sync?.lastUpdated ?? '(none)'} · periodEnd: ${payload.periodEnd ?? '(none)'}`);

// ---- 2. Admin summary vs spec §12 (tolerance + drift) ----
const today = dhakaToday();
const index = buildRetailIndex(payload, today);
const admin = summarizeWithIndex(index, { employeeId: '2025019', role: 'admin' });
check('admin total within 5% of spec 35,867,072', withinPct(admin.totalPremium, 35867072, 5), fmt(admin.totalPremium));
check('admin FYCP within 5% of spec 33,603,172', withinPct(admin.fycp, 33603172, 5), fmt(admin.fycp));
check('admin policies within 5% of spec 2,282', withinPct(admin.policies, 2282, 5), String(admin.policies));
check(
  'admin persistency within 5 pts of spec 60.9%',
  admin.persistency !== null && Math.abs(admin.persistency.pct - 60.9) <= 5,
  admin.persistency ? `${admin.persistency.pct.toFixed(1)}% (${admin.persistency.inf}/${admin.persistency.all})` : 'null',
);
if (today.startsWith('2026-11')) {
  // MTD sheet part (independent of the summarizer): Inforce rows with
  // nextDue in [monthStart, today], amount = premium (NOT duePrem).
  // The summary's Due Premium = this sheet part + the ledger
  // fallback for sheet-absent policies (0 for Nov 2026 — the live
  // T-series instalments fall in May 2027), so the two agree within
  // a small tolerance; the full-month figure (249 pol / ৳16,53,216)
  // is NOT the expectation any more (reconciled 2026-11-20: the
  // retail app's default view is MTD).
  const monthStart = `${today.slice(0, 7)}-01`;
  const sheetMtdRows = payload.duePolicies.filter(
    (d) => String(d.status || '').trim().toLowerCase() === 'inforce' && d.nextDue >= monthStart && d.nextDue <= today && num(d.premium) > 0,
  );
  const sheetMtd = sheetMtdRows.reduce((a, d) => a + num(d.premium), 0);
  const sheetMtdPolicies = new Set(sheetMtdRows.map((d) => String(d.policy))).size;
  check('admin due MTD within 5% of the recomputed sheet MTD part', withinPct(admin.duePremium, sheetMtd, 5), `${fmt(admin.duePremium)} (${admin.duePolicies} pol) vs sheet ${fmt(sheetMtd)} (${sheetMtdPolicies} pol)`);
  check('admin due MTD policies >= sheet MTD policies (fallback only adds)', admin.duePolicies >= sheetMtdPolicies, `${admin.duePolicies} vs ${sheetMtdPolicies}`);
  check('admin due window is MTD [monthStart, today]', admin.dueWindow?.start === monthStart && admin.dueWindow?.end === today, JSON.stringify(admin.dueWindow));
} else {
  check('admin due this month positive (spec value is Nov 2026 only)', admin.duePremium > 0 && admin.duePolicies > 0, `${fmt(admin.duePremium)} (${admin.duePolicies} pol, ${admin.dueMonth})`);
}
check(
  'admin top BE within 5% of spec 60,69,003',
  withinPct(admin.leaderboard.entries[0]?.premium ?? 0, 6069003, 5),
  `${admin.leaderboard.entries[0]?.name ?? '(none)'} ${fmt(admin.leaderboard.entries[0]?.premium ?? 0)}`,
);
check('admin unassigned within 5% of spec 23,56,985', withinPct(admin.unassigned?.premium ?? 0, 2356985, 5), fmt(admin.unassigned?.premium ?? 0));
check(
  'admin active FAs sane (total ~629, active ~537 ever-sold)',
  withinPct(admin.activeFas.total, 629, 5) && withinPct(admin.activeFas.active, 537, 15),
  `${admin.activeFas.active} of ${admin.activeFas.total}`,
);

// ---- 3. Independent recomputation (exact — same payload) ----
const sumTotal = payload.records.reduce((a, r) => a + num(r.total), 0);
check('recompute: Σ total == admin totalPremium', Math.abs(sumTotal - admin.totalPremium) < 1, `${fmt(sumTotal)} vs ${fmt(admin.totalPremium)}`);
const sumFycp = payload.records.reduce((a, r) => a + num(r.fycp), 0);
check('recompute: Σ fycp == admin fycp', Math.abs(sumFycp - admin.fycp) < 1, `${fmt(sumFycp)} vs ${fmt(admin.fycp)}`);
const newPolicies = new Set(payload.records.filter(isNewType).map((r) => String(r.policy)));
check('recompute: distinct New policies == admin policies', newPolicies.size === admin.policies, `${newPolicies.size} vs ${admin.policies}`);
const sumNew = payload.records.filter(isNewType).reduce((a, r) => a + num(r.new), 0);
check('recompute: Σ New within 5% of spec 24,760,983', withinPct(sumNew, 24760983, 5), fmt(sumNew));
let bucketTotal = 0;
for (const b of index.faBuckets.values()) bucketTotal += b.total;
for (const b of index.directBuckets.values()) bucketTotal += b.total;
for (const b of index.residualBuckets.values()) bucketTotal += b.total;
check('reconcile: FA + direct + residual buckets == org total', Math.abs(bucketTotal - admin.totalPremium) < 1, `${fmt(bucketTotal)} vs ${fmt(admin.totalPremium)}`);
let residualTotal = 0;
for (const b of index.residualBuckets.values()) residualTotal += b.total;
check('reconcile: admin unassigned == Σ residual buckets', admin.unassigned !== null && Math.abs(admin.unassigned.premium - residualTotal) < 1, `${fmt(admin.unassigned?.premium ?? 0)} vs ${fmt(residualTotal)}`);
// Ever-sold Active FAs (the retail app's headline KPI): canonical FAs
// with ANY PR row, recomputed straight from the records — exact, and
// equal to the retail app's producers `activity` count (537 live).
const everSold = new Set(payload.records.map((r) => index.canonicalFA(r.faCode)).filter(Boolean));
check('recompute: ever-sold FAs == admin activeFas.active', everSold.size === admin.activeFas.active, `${everSold.size} vs ${admin.activeFas.active}`);
// Dues this week: the week window is the Bangladesh calendar week
// (Sunday–Saturday) containing today; the sheet part recomputed
// directly (Inforce, nextDue in the week, premium > 0). The summary
// figure is the sheet part + the ledger fallback, so it is >= the
// sheet part and within 5% of it when the fallback is empty.
const weekStart = admin.duesThisWeek?.weekStart;
const weekEnd = admin.duesThisWeek?.weekEnd;
const weekDow = new Date(`${today}T00:00:00Z`).getUTCDay();
const weekStartExp = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weekDow);
  return d.toISOString().slice(0, 10);
})();
const weekEndExp = (() => {
  const d = new Date(`${weekStartExp}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
})();
check('recompute: duesThisWeek window is Sun–Sat containing today', weekStart === weekStartExp && weekEnd === weekEndExp, `${weekStart}..${weekEnd} vs ${weekStartExp}..${weekEndExp}`);
const weekSheetRows = payload.duePolicies.filter(
  (d) => String(d.status || '').trim().toLowerCase() === 'inforce' && d.nextDue >= weekStart && d.nextDue <= weekEnd && num(d.premium) > 0,
);
const weekSheet = weekSheetRows.reduce((a, d) => a + num(d.premium), 0);
const weekSheetPolicies = new Set(weekSheetRows.map((d) => String(d.policy))).size;
check(
  'recompute: duesThisWeek >= sheet week part, within 5%',
  (admin.duesThisWeek?.amount ?? 0) >= weekSheet && withinPct(admin.duesThisWeek?.amount ?? 0, weekSheet, 5) && (admin.duesThisWeek?.count ?? 0) >= weekSheetPolicies,
  `${fmt(admin.duesThisWeek?.amount ?? 0)} (${admin.duesThisWeek?.count} pol) vs sheet ${fmt(weekSheet)} (${weekSheetPolicies} pol)`,
);
// Due rows: exactly 3 (or fewer when the scope has fewer dues),
// sorted by nextDue ascending, each row owner + nextDue + premium
// ONLY — no policy number, no mobile field anywhere.
check('recompute: admin dueRows is 3 rows, sorted by nextDue', Array.isArray(admin.dueRows) && admin.dueRows.length === 3 && admin.dueRows.every((r, i) => i === 0 || admin.dueRows[i - 1].nextDue <= r.nextDue), JSON.stringify(admin.dueRows));
check(
  'recompute: dueRows carry only owner/nextDue/premium (no mobile, no policy)',
  Array.isArray(admin.dueRows) && admin.dueRows.every((r) => Object.keys(r).sort().join(',') === 'nextDue,owner,premium'),
  JSON.stringify(admin.dueRows?.[0] ?? null),
);
check(
  'recompute: dueRows are the 3 earliest Inforce dues',
  Array.isArray(admin.dueRows) &&
    JSON.stringify(admin.dueRows.map((r) => r.nextDue)) ===
      JSON.stringify(
        payload.duePolicies
          .filter((d) => d.policy && d.nextDue && String(d.status || '').trim().toLowerCase() === 'inforce' && num(d.premium) > 0)
          .map((d) => d.nextDue)
          .sort()
          .slice(0, 3),
      ),
  JSON.stringify(admin.dueRows?.map((r) => r.nextDue)),
);

// ---- 4. Scoping (live payload) ----
const um = summarizeWithIndex(index, { employeeId: '1101020102', role: 'team_lead' });
check('scope UM team_lead: scope team, total within 10% of 4,107', um.scope === 'team' && withinPct(um.totalPremium, 4107, 10), `${um.scope} ${fmt(um.totalPremium)}`);
check('scope UM team_lead: leaderboard is direct reports (1–5)', um.leaderboard.kind === 'reports' && um.leaderboard.entries.length >= 1 && um.leaderboard.entries.length <= 5, `${um.leaderboard.entries.length} entries`);
check('scope UM team_lead: total <= org total', um.totalPremium <= admin.totalPremium, `${fmt(um.totalPremium)} <= ${fmt(admin.totalPremium)}`);
const umEmp = summarizeWithIndex(index, { employeeId: '1101020102', role: 'employee' });
check('scope UM as employee: fail-closed (0, own, no leaderboard)', umEmp.totalPremium === 0 && umEmp.scope === 'own' && umEmp.leaderboard.kind === 'none' && umEmp.empty === true, `total ${umEmp.totalPremium} empty=${umEmp.empty} reason=${umEmp.emptyReason}`);
// An FA with real rows (picked dynamically — a zero-row FA would make the check trivial).
const faCode = (() => {
  for (const r of payload.records) {
    const fa = index.canonicalFA(r.faCode);
    if (fa && (index.faBuckets.get(fa)?.total ?? 0) > 0) return fa;
  }
  return null;
})();
check('scope FA: a with-rows FA exists in the payload', faCode !== null, faCode ?? 'none');
if (faCode) {
  const fa = summarizeWithIndex(index, { employeeId: faCode, role: 'employee' });
  const faOwn = payload.records.filter((r) => index.canonicalFA(r.faCode) === faCode).reduce((a, r) => a + num(r.total), 0);
  check('scope FA employee: total == own bucket (independent)', Math.abs(fa.totalPremium - faOwn) < 1, `${fmt(fa.totalPremium)} vs ${fmt(faOwn)}`);
  check('scope FA employee: scope own, no leaderboard, 1 FA in scope', fa.scope === 'own' && fa.leaderboard.kind === 'none' && fa.activeFas.total === 1, JSON.stringify(fa.activeFas));
}
const be = summarizeWithIndex(index, { employeeId: 'NZI', role: 'manager' });
check('scope BE NZI manager: total == beTotals NZI (exact)', be.totalPremium === index.beTotals.get('NZI')?.total, `${fmt(be.totalPremium)} vs ${fmt(index.beTotals.get('NZI')?.total ?? 0)}`);
check('scope BE NZI manager: within 5% of spec 47,87,224', withinPct(be.totalPremium, 4787224, 5), fmt(be.totalPremium));
check('scope BE NZI manager: leaderboard is GM reports', be.leaderboard.kind === 'reports' && be.leaderboard.entries.length >= 1, `${be.leaderboard.entries.length} entries`);
const gm = summarizeWithIndex(index, { employeeId: '13', role: 'manager' });
check('scope GM KAMRUJJAMAN: within 5% of spec 31,54,333', withinPct(gm.totalPremium, 3154333, 5), fmt(gm.totalPremium));
check('scope GM KAMRUJJAMAN: 256 policies within 5%', withinPct(gm.policies, 256, 5), String(gm.policies));
const staff = summarizeWithIndex(index, { employeeId: '2025019', role: 'employee' });
check('scope staff ID as employee: empty, no-code', staff.empty === true && staff.emptyReason === 'no-code', `empty=${staff.empty} reason=${staff.emptyReason}`);

// ---- 5. Demo fixture exact values (pinned date) ----
{
  const fx = buildDemoPayload(FIXTURE_TODAY);
  const adm = summarizeRetail(fx, { employeeId: '9990004', role: 'admin' }, FIXTURE_TODAY);
  check('fixture admin total 241000', adm.totalPremium === 241000, String(adm.totalPremium));
  check('fixture admin FYCP 233000', adm.fycp === 233000, String(adm.fycp));
  check('fixture admin policies 9', adm.policies === 9, String(adm.policies));
  check('fixture admin due 38000 (5 pol)', adm.duePremium === 38000 && adm.duePolicies === 5, `${adm.duePremium} (${adm.duePolicies})`);
  check('fixture admin persistency 8/9', adm.persistency?.inf === 8 && adm.persistency?.all === 9, JSON.stringify(adm.persistency));
  check('fixture admin active 4 of 4 (ever-sold)', adm.activeFas.active === 4 && adm.activeFas.total === 4, JSON.stringify(adm.activeFas));
  check('fixture admin unassigned 7000 (1)', adm.unassigned?.premium === 7000 && adm.unassigned?.policies === 1, JSON.stringify(adm.unassigned));
  check('fixture admin BE DMO 234000 (8)', adm.leaderboard.entries[0]?.premium === 234000 && adm.leaderboard.entries[0]?.policies === 8, JSON.stringify(adm.leaderboard.entries));
  check('fixture admin deferred 6.2%', Math.abs(adm.deferredRatio - (15000 / 241000) * 100) < 0.01, String(adm.deferredRatio));
  check('fixture admin renewal 3.3%', Math.abs(adm.renewalRatio - (8000 / 241000) * 100) < 0.01, String(adm.renewalRatio));

  const mgr = summarizeRetail(fx, { employeeId: '9990003', role: 'manager' }, FIXTURE_TODAY);
  check('fixture mgr total 234000', mgr.totalPremium === 234000, String(mgr.totalPremium));
  check('fixture mgr FYCP 226000', mgr.fycp === 226000, String(mgr.fycp));
  check('fixture mgr policies 8', mgr.policies === 8, String(mgr.policies));
  check('fixture mgr due 38000 (5)', mgr.duePremium === 38000 && mgr.duePolicies === 5, `${mgr.duePremium} (${mgr.duePolicies})`);
  check('fixture mgr persistency 7/8', mgr.persistency?.inf === 7 && mgr.persistency?.all === 8, JSON.stringify(mgr.persistency));
  check('fixture mgr active 4 of 4 (ever-sold)', mgr.activeFas.active === 4 && mgr.activeFas.total === 4, JSON.stringify(mgr.activeFas));
  check('fixture mgr leaders 9990002 then 9990005', mgr.leaderboard.entries[0]?.premium === 164000 && mgr.leaderboard.entries[1]?.premium === 70000, JSON.stringify(mgr.leaderboard.entries));
  check('fixture mgr no unassigned', mgr.unassigned === null, JSON.stringify(mgr.unassigned));

  const lead = summarizeRetail(fx, { employeeId: '9990002', role: 'team_lead' }, FIXTURE_TODAY);
  check('fixture lead total 164000', lead.totalPremium === 164000, String(lead.totalPremium));
  check('fixture lead FYCP 156000', lead.fycp === 156000, String(lead.fycp));
  check('fixture lead policies 7', lead.policies === 7, String(lead.policies));
  check('fixture lead due 34000 (4)', lead.duePremium === 34000 && lead.duePolicies === 4, `${lead.duePremium} (${lead.duePolicies})`);
  check('fixture lead persistency 5/6', lead.persistency?.inf === 5 && lead.persistency?.all === 6, JSON.stringify(lead.persistency));
  check('fixture lead active 3 of 3 (ever-sold)', lead.activeFas.active === 3 && lead.activeFas.total === 3, JSON.stringify(lead.activeFas));
  check('fixture lead leaders 67000/57000/15000', lead.leaderboard.entries.map((e) => e.premium).join(',') === '67000,57000,15000', JSON.stringify(lead.leaderboard.entries));
  check('fixture lead deferred 3.0% / renewal 4.9%', Math.abs(lead.deferredRatio - (5000 / 164000) * 100) < 0.01 && Math.abs(lead.renewalRatio - (8000 / 164000) * 100) < 0.01, `${lead.deferredRatio} / ${lead.renewalRatio}`);

  // New / Deferred premium sums (Home FYCP card sub-text, Mahadi
  // 2026-11-20): New = Σ new-premium column, Deferred = Σ deferred
  // column, FYCP = New + Deferred — the same columns the
  // deferredRatio/renewalRatio are computed from.
  check('fixture admin new 218000 / deferred 15000', adm.newPremium === 218000 && adm.deferredPremium === 15000, `${adm.newPremium} / ${adm.deferredPremium}`);
  check('fixture mgr new 211000 / deferred 15000', mgr.newPremium === 211000 && mgr.deferredPremium === 15000, `${mgr.newPremium} / ${mgr.deferredPremium}`);
  check('fixture lead new 151000 / deferred 5000', lead.newPremium === 151000 && lead.deferredPremium === 5000, `${lead.newPremium} / ${lead.deferredPremium}`);
  const emp = summarizeRetail(fx, { employeeId: '9990001', role: 'employee' }, FIXTURE_TODAY);
  check('fixture emp new 62000 / deferred 5000', emp.newPremium === 62000 && emp.deferredPremium === 5000, `${emp.newPremium} / ${emp.deferredPremium}`);
  check('fixture FYCP == new + deferred (all roles)', adm.fycp === adm.newPremium + adm.deferredPremium && mgr.fycp === mgr.newPremium + mgr.deferredPremium && lead.fycp === lead.newPremium + lead.deferredPremium && emp.fycp === emp.newPremium + emp.deferredPremium);
  const sumNewFx = fx.records.reduce((a, r) => a + num(r.new), 0);
  const sumDefFx = fx.records.reduce((a, r) => a + num(r.deferred), 0);
  check('fixture recompute: Σ new == admin newPremium', adm.newPremium === sumNewFx, `${adm.newPremium} vs ${sumNewFx}`);
  check('fixture recompute: Σ deferred == admin deferredPremium', adm.deferredPremium === sumDefFx, `${adm.deferredPremium} vs ${sumDefFx}`);
  check('fixture emp total 67000', emp.totalPremium === 67000, String(emp.totalPremium));
  check('fixture emp policies 3', emp.policies === 3, String(emp.policies));
  check('fixture emp due 17000 (2)', emp.duePremium === 17000 && emp.duePolicies === 2, `${emp.duePremium} (${emp.duePolicies})`);
  check('fixture emp persistency 2/2', emp.persistency?.inf === 2 && emp.persistency?.all === 2, JSON.stringify(emp.persistency));
  check('fixture emp active 1 of 1', emp.activeFas.active === 1 && emp.activeFas.total === 1, JSON.stringify(emp.activeFas));
  check('fixture emp no leaderboard', emp.leaderboard.kind === 'none' && emp.leaderboard.entries.length === 0, emp.leaderboard.kind);
  check('fixture emp scope own', emp.scope === 'own', emp.scope);
  check('fixture lead scope team', lead.scope === 'team', lead.scope);
  check('fixture mgr scope subtree', mgr.scope === 'subtree', mgr.scope);
  check('fixture admin scope org', adm.scope === 'org', adm.scope);

  // Dues this week (Sun 15 – Sat 21 Nov 2026): sheet D1011 8,000 +
  // T-series ledger T9002 9,000 (instalment on the 15th) = 17,000
  // (2 pol) org-wide; 9990001 has none (T9001's instalment is Nov 4).
  check('fixture admin duesThisWeek 17000 (2), week 11-15..11-21', adm.duesThisWeek.count === 2 && adm.duesThisWeek.amount === 17000 && adm.duesThisWeek.weekStart === '2026-11-15' && adm.duesThisWeek.weekEnd === '2026-11-21', JSON.stringify(adm.duesThisWeek));
  check('fixture mgr duesThisWeek 17000 (2)', mgr.duesThisWeek.count === 2 && mgr.duesThisWeek.amount === 17000, JSON.stringify(mgr.duesThisWeek));
  check('fixture lead duesThisWeek 17000 (2)', lead.duesThisWeek.count === 2 && lead.duesThisWeek.amount === 17000, JSON.stringify(lead.duesThisWeek));
  check('fixture emp duesThisWeek 0', emp.duesThisWeek.count === 0 && emp.duesThisWeek.amount === 0, JSON.stringify(emp.duesThisWeek));
  // Due rows (top 3, nearest due date first; owner + nextDue +
  // premium only). Overdue rows come first (D1012, Oct 10).
  check('fixture admin dueRows D1012/D1001/D2001', JSON.stringify(adm.dueRows.map((r) => [r.nextDue, r.premium])) === JSON.stringify([['2026-10-10', 3000], ['2026-11-10', 5000], ['2026-11-12', 4000]]), JSON.stringify(adm.dueRows));
  check('fixture lead dueRows D1012/D1001/D1011', JSON.stringify(lead.dueRows.map((r) => [r.nextDue, r.premium])) === JSON.stringify([['2026-10-10', 3000], ['2026-11-10', 5000], ['2026-11-20', 8000]]), JSON.stringify(lead.dueRows));
  check('fixture emp dueRows D1001/D1002 (only 2)', JSON.stringify(emp.dueRows.map((r) => [r.nextDue, r.premium])) === JSON.stringify([['2026-11-10', 5000], ['2026-12-08', 2000]]), JSON.stringify(emp.dueRows));
  check('fixture dueRows carry only owner/nextDue/premium', [adm, mgr, lead, emp].every((s) => s.dueRows.every((r) => Object.keys(r).sort().join(',') === 'nextDue,owner,premium')), JSON.stringify(adm.dueRows[0]));
  check('fixture dueWindow is MTD 11-01..11-20', adm.dueWindow?.start === '2026-11-01' && adm.dueWindow?.end === '2026-11-20', JSON.stringify(adm.dueWindow));
}

// ---- 5b. Time-frame filter (fixture, pinned date) ----
{
  const fx = buildDemoPayload(FIXTURE_TODAY);
  const adminUser = { employeeId: '9990004', role: 'admin' };
  const empUser = { employeeId: '9990001', role: 'employee' };

  // Hand-computed org values per period (see api/_lib/demoFixture.js).
  // D1001's two records are dated today (2026-11-20), so 'today' is
  // non-zero and this-month includes them.
  const orgExpected = {
    'today': { total: 35000, fycp: 35000, policies: 1, unassigned: null, be: 35000 },
    'this-month': { total: 113000, fycp: 105000, policies: 2, unassigned: null, be: 113000 },
    '3m': { total: 185000, fycp: 177000, policies: 5, unassigned: 7000, be: 178000 },
    '6m': { total: 205000, fycp: 197000, policies: 6, unassigned: 7000, be: 198000 },
    'this-year': { total: 241000, fycp: 233000, policies: 9, unassigned: 7000, be: 234000 },
    'all': { total: 241000, fycp: 233000, policies: 9, unassigned: 7000, be: 234000 },
  };
  for (const [period, exp] of Object.entries(orgExpected)) {
    const s = summarizeRetail(fx, adminUser, FIXTURE_TODAY, period);
    check(`period ${period}: org total ${exp.total}`, s.totalPremium === exp.total, String(s.totalPremium));
    check(`period ${period}: org FYCP ${exp.fycp}`, s.fycp === exp.fycp, String(s.fycp));
    check(`period ${period}: org policies ${exp.policies}`, s.policies === exp.policies, String(s.policies));
    check(
      `period ${period}: org unassigned ${exp.unassigned ?? 'null'}`,
      (s.unassigned?.premium ?? null) === exp.unassigned,
      JSON.stringify(s.unassigned),
    );
    check(`period ${period}: org top BE ${exp.be}`, s.leaderboard.entries[0]?.premium === exp.be, JSON.stringify(s.leaderboard.entries));
    // Snapshot KPIs never move with the period.
    check(`period ${period}: due stays 38000 (5)`, s.duePremium === 38000 && s.duePolicies === 5, `${s.duePremium} (${s.duePolicies})`);
    check(`period ${period}: persistency stays 8/9`, s.persistency?.inf === 8 && s.persistency?.all === 9, JSON.stringify(s.persistency));
    check(`period ${period}: active stays 4 of 4`, s.activeFas.active === 4 && s.activeFas.total === 4, JSON.stringify(s.activeFas));
    // The summary echoes the period + window it was computed for.
    const w = periodDateWindow(period, FIXTURE_TODAY);
    check(`period ${period}: echoes period + window`, s.period === period && JSON.stringify(s.periodWindow) === JSON.stringify(w), `${s.period} ${JSON.stringify(s.periodWindow)}`);
  }

  // Employee scope inside a period (own rows only).
  const empExpected = {
    'today': { total: 35000, policies: 1 },
    'this-month': { total: 35000, policies: 1 },
    '3m': { total: 35000, policies: 1 },
    '6m': { total: 55000, policies: 2 },
    'this-year': { total: 67000, policies: 3 },
    'all': { total: 67000, policies: 3 },
  };
  for (const [period, exp] of Object.entries(empExpected)) {
    const s = summarizeRetail(fx, empUser, FIXTURE_TODAY, period);
    check(`period ${period}: emp total ${exp.total}`, s.totalPremium === exp.total, String(s.totalPremium));
    check(`period ${period}: emp policies ${exp.policies}`, s.policies === exp.policies, String(s.policies));
    check(`period ${period}: emp due stays 17000 (2)`, s.duePremium === 17000 && s.duePolicies === 2, `${s.duePremium} (${s.duePolicies})`);
  }

  // Independent recomputation: org total + policies from the raw rows,
  // filtered by the same window, must match the summarizer exactly.
  for (const period of ['today', 'this-month', '3m', '6m', 'this-year', 'all']) {
    const w = periodDateWindow(period, FIXTURE_TODAY);
    const rows = w ? fx.records.filter((r) => r.date >= w.start && r.date <= w.end) : fx.records;
    const total = rows.reduce((a, r) => a + num(r.total), 0);
    const policies = new Set(rows.filter(isNewType).map((r) => String(r.policy))).size;
    const s = summarizeRetail(fx, adminUser, FIXTURE_TODAY, period);
    check(`period ${period}: recomputed org total matches`, s.totalPremium === total, `${s.totalPremium} vs ${total}`);
    check(`period ${period}: recomputed org policies match`, s.policies === policies, `${s.policies} vs ${policies}`);
    // Employee recomputation: own rows only (faCode 9990001).
    const ownRows = rows.filter((r) => String(r.faCode) === '9990001');
    const ownTotal = ownRows.reduce((a, r) => a + num(r.total), 0);
    const ownPolicies = new Set(ownRows.filter(isNewType).map((r) => String(r.policy))).size;
    const e = summarizeRetail(fx, empUser, FIXTURE_TODAY, period);
    check(`period ${period}: recomputed emp total matches`, e.totalPremium === ownTotal, `${e.totalPremium} vs ${ownTotal}`);
    check(`period ${period}: recomputed emp policies match`, e.policies === ownPolicies, `${e.policies} vs ${ownPolicies}`);
  }

  // Custom ranges: a valid range returns exactly the rows inside it
  // (org + employee, recomputed from the raw rows), and the summary
  // echoes period='custom' + the window. A single empty day returns
  // zero business with the snapshots intact.
  for (const [from, to] of [['2026-11-01', '2026-11-20'], ['2026-08-20', '2026-08-20']]) {
    const range = { start: from, end: to };
    const rows = fx.records.filter((r) => r.date >= from && r.date <= to);
    const total = rows.reduce((a, r) => a + num(r.total), 0);
    const policies = new Set(rows.filter(isNewType).map((r) => String(r.policy))).size;
    const s = summarizeRetail(fx, adminUser, FIXTURE_TODAY, 'custom', range);
    check(`custom ${from}..${to}: org total ${total}`, s.totalPremium === total, String(s.totalPremium));
    check(`custom ${from}..${to}: org policies ${policies}`, s.policies === policies, String(s.policies));
    check(`custom ${from}..${to}: echoes period + window`, s.period === 'custom' && s.periodWindow?.start === from && s.periodWindow?.end === to, `${s.period} ${JSON.stringify(s.periodWindow)}`);
    check(`custom ${from}..${to}: snapshots intact (due 38000, 8/9, 4 of 4)`, s.duePremium === 38000 && s.persistency?.inf === 8 && s.persistency?.all === 9 && s.activeFas.active === 4, `${s.duePremium} ${JSON.stringify(s.persistency)} ${JSON.stringify(s.activeFas)}`);
    const ownRows = rows.filter((r) => String(r.faCode) === '9990001');
    const ownTotal = ownRows.reduce((a, r) => a + num(r.total), 0);
    const ownPolicies = new Set(ownRows.filter(isNewType).map((r) => String(r.policy))).size;
    const e = summarizeRetail(fx, empUser, FIXTURE_TODAY, 'custom', range);
    check(`custom ${from}..${to}: emp total ${ownTotal}`, e.totalPremium === ownTotal, String(e.totalPremium));
    check(`custom ${from}..${to}: emp policies ${ownPolicies}`, e.policies === ownPolicies, String(e.policies));
  }
  // The November custom range equals this-month exactly.
  {
    const tm = summarizeRetail(fx, adminUser, FIXTURE_TODAY, 'this-month');
    const cu = summarizeRetail(fx, adminUser, FIXTURE_TODAY, 'custom', { start: '2026-11-01', end: '2026-11-20' });
    check('custom Nov == this-month (113000, 2 pol)', cu.totalPremium === tm.totalPremium && cu.policies === tm.policies && cu.totalPremium === 113000, `${cu.totalPremium} (${cu.policies}) vs ${tm.totalPremium} (${tm.policies})`);
  }

  // Boundary dates: a record ON the 3m start date is in; one day
  // before is out; a record ON today is in; a future-dated record is
  // out of every windowed period (but 'all' has no date filter).
  {
    const fxB = buildDemoPayload(FIXTURE_TODAY);
    const boundary = [
      { policy: 'B-START', faCode: '9990001', date: '2026-08-20', type: 'New', amount: 1000 },
      { policy: 'B-BEFORE', faCode: '9990001', date: '2026-08-19', type: 'New', amount: 2000 },
      { policy: 'B-TODAY', faCode: '9990001', date: '2026-11-20', type: 'New', amount: 4000 },
      { policy: 'B-FUTURE', faCode: '9990001', date: '2026-11-21', type: 'New', amount: 8000 },
    ];
    for (const b of boundary) {
      fxB.records.push({
        policy: b.policy,
        faCode: b.faCode,
        date: b.date,
        type: b.type,
        total: b.amount,
        new: b.amount,
        fycp: b.amount,
        deferred: 0,
        renewal: 0,
      });
    }
    const s3m = summarizeRetail(fxB, empUser, FIXTURE_TODAY, '3m');
    check('boundary 3m: start-date + today in, before + future out (40000, 3 pol)', s3m.totalPremium === 40000 && s3m.policies === 3, `${s3m.totalPremium} (${s3m.policies})`);
    const sAll = summarizeRetail(fxB, empUser, FIXTURE_TODAY, 'all');
    check('boundary all: no date filter (82000, 7 pol)', sAll.totalPremium === 82000 && sAll.policies === 7, `${sAll.totalPremium} (${sAll.policies})`);
    const sTm = summarizeRetail(fxB, empUser, FIXTURE_TODAY, 'this-month');
    check('boundary this-month: D1001 today + B-TODAY in (39000, 2 pol)', sTm.totalPremium === 39000 && sTm.policies === 2, `${sTm.totalPremium} (${sTm.policies})`);
    const sToday = summarizeRetail(fxB, empUser, FIXTURE_TODAY, 'today');
    check('boundary today: D1001 today + B-TODAY in (39000, 2 pol)', sToday.totalPremium === 39000 && sToday.policies === 2, `${sToday.totalPremium} (${sToday.policies})`);
  }
}

// ---- 6. DEV key match (proxy copy vs browser copy) ----
{
  const verifyJwtSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/verifyJwt.js'), 'utf8');
  const keysSrc = fs.readFileSync(path.join(ROOT, 'src/auth/keys.ts'), 'utf8');
  const pemOf = (src) => {
    const m = src.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/);
    return m ? m[0] : null;
  };
  const kidOf = (src) => {
    const m = src.match(/DEV_KID = '([0-9a-f]{16})'/);
    return m ? m[1] : null;
  };
  const proxyPem = pemOf(verifyJwtSrc);
  const browserPem = pemOf(keysSrc);
  check('dev key: proxy PEM matches src/auth/keys.ts', proxyPem !== null && proxyPem === browserPem, proxyPem ? `${proxyPem.length} chars` : 'no PEM found');
  check('dev key: proxy kid matches src/auth/keys.ts', kidOf(verifyJwtSrc) !== null && kidOf(verifyJwtSrc) === kidOf(keysSrc), `proxy=${kidOf(verifyJwtSrc)} browser=${kidOf(keysSrc)}`);
}

// ---- 7. Proxy handler (real handler, stubbed retail fetch) ----
{
  // Ephemeral keypair for the test; the proxy reads it via env.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const kid = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
  process.env.HUB_PUBLIC_KEY_PEM = pem;
  process.env.HUB_KID = kid;
  process.env.HUB_DEMO_FIXTURE = 'true';
  process.env.VERCEL_ENV = 'preview';

  const b64url = (buf) => Buffer.from(buf).toString('base64url');
  function signToken(claims, { kid: k = kid, alg = 'RS256' } = {}) {
    const head = b64url(JSON.stringify({ alg, typ: 'JWT', kid: k }));
    const iat = Math.floor(Date.now() / 1000);
    const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + 3600, iss: 'shanta-life-agent-hub' }));
    const input = `${head}.${body}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
    return `${input}.${b64url(sig)}`;
  }

  // Stub the retail fetch with the live payload fetched above.
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls++;
    if (String(url).includes('retail-dashboard-zeta.vercel.app/api/sales-data')) {
      return { ok: true, status: 200, json: async () => payload };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const { default: handler } = await import('../api/retail-data.js');
  const mockReq = ({ method = 'GET', token = null, url = '/api/retail-data' } = {}) => ({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const mockRes = () => {
    const res = { statusCode: 0, headers: {}, body: '' };
    res.setHeader = (k, v) => {
      res.headers[k] = v;
    };
    res.end = (b) => {
      res.body = b;
    };
    return res;
  };
  async function call(req) {
    const res = mockRes();
    await handler(req, res);
    let json = null;
    try {
      json = JSON.parse(res.body);
    } catch {
      /* ignore */
    }
    return { res, json };
  }

  {
    const { res } = await call(mockReq());
    check('proxy: no token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const { res } = await call(mockReq({ token: 'not.a.token' }));
    check('proxy: garbage token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { alg: 'HS256' });
    const { res } = await call(mockReq({ token: t }));
    check('proxy: alg HS256 -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const t = signToken({ sub: '9990004', name: 'X', role: 'admin' }, { kid: 'deadbeefdeadbeef' });
    const { res } = await call(mockReq({ token: t }));
    check('proxy: unknown kid -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const iat = Math.floor(Date.now() / 1000) - 7200;
    const body = b64url(
      JSON.stringify({ sub: '2025019', name: 'X', role: 'admin', iat, exp: iat + 3600, iss: 'shanta-life-agent-hub' }),
    );
    const input = `${head}.${body}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
    const t = `${input}.${b64url(sig)}`;
    const { res } = await call(mockReq({ token: t }));
    check('proxy: expired token -> 401', res.statusCode === 401, String(res.statusCode));
  }
  {
    const { res } = await call(mockReq({ method: 'POST', token: signToken({ sub: '9990004', name: 'X', role: 'admin' }) }));
    check('proxy: POST -> 405', res.statusCode === 405, String(res.statusCode));
  }
  {
    // Bare call: the default period is Today now (fixture: D1001's
    // two records, 35000). All-time needs an explicit ?period=all.
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo admin -> 200, fixture (demo:true)', res.statusCode === 200 && json?.demo === true, `status=${res.statusCode} demo=${json?.demo}`);
    check('proxy: demo admin default period today, total 35000', json?.period === 'today' && json?.totalPremium === 35000, `period=${json?.period} total=${json?.totalPremium}`);
    check('proxy: Cache-Control private, no-store', res.headers['Cache-Control'] === 'private, no-store', res.headers['Cache-Control']);
    const { res: resAll, json: jsonAll } = await call(mockReq({ token: t, url: '/api/retail-data?period=all' }));
    check('proxy: demo admin ?period=all fixture total 241000', resAll.statusCode === 200 && jsonAll?.totalPremium === 241000, `status=${resAll.statusCode} total=${jsonAll?.totalPremium}`);
  }
  {
    // The live `admin` summary above is all-time (the summarizer's
    // default), so the comparison call passes ?period=all explicitly
    // — the bare-call default is Today now.
    const t = signToken({ sub: '2025019', name: 'Staff', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t, url: '/api/retail-data?period=all' }));
    check('proxy: real admin -> 200, live org summary', res.statusCode === 200 && json?.demo === false && json?.scope === 'org', `status=${res.statusCode} demo=${json?.demo} scope=${json?.scope}`);
    check('proxy: real admin total == live admin total', json?.totalPremium === admin.totalPremium, `${fmt(json?.totalPremium ?? 0)} vs ${fmt(admin.totalPremium)}`);
    check('proxy: no raw rows leak in the response', !res.body.includes('"records"') && !res.body.includes('NAZAHA HAQUE'), '');
  }
  {
    const t = signToken({ sub: '1101020102', name: 'UM', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t, url: '/api/retail-data?period=all' }));
    check('proxy: UM team_lead -> 200 scoped', res.statusCode === 200 && json?.scope === 'team' && json?.totalPremium === um.totalPremium, `status=${res.statusCode} scope=${json?.scope} total=${json?.totalPremium}`);
  }
  {
    delete process.env.HUB_DEMO_FIXTURE;
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo w/o flag -> empty, demo:false', res.statusCode === 200 && json?.demo === false && json?.empty === true && json?.emptyReason === 'no-code', `demo=${json?.demo} empty=${json?.empty} reason=${json?.emptyReason}`);
    process.env.HUB_DEMO_FIXTURE = 'true';
  }
  {
    // This demo project's deployments run on the production target, so
    // VERCEL_ENV is 'production' live — the fixture must serve with the
    // flag set regardless of VERCEL_ENV (live bug 2026-11-20: the old
    // VERCEL_ENV gate silently disabled the fixture on the preview).
    process.env.VERCEL_ENV = 'production';
    const t = signToken({ sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: demo + flag in production env -> fixture served', res.statusCode === 200 && json?.demo === true && json?.scope === 'team', `demo=${json?.demo} scope=${json?.scope}`);
    process.env.VERCEL_ENV = 'preview';
  }
  {
    // Period handling: an invalid value is a 400, never a silent
    // fallback to 'all' (the caller would read the wrong window).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res } = await call(mockReq({ token: t, url: '/api/retail-data?period=bogus' }));
    check('proxy: invalid period -> 400', res.statusCode === 400, String(res.statusCode));
  }
  {
    // Demo path honours ?period= — the fixture is relative-dated, so
    // its 3m values are the same on any day (see §5b).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t, url: '/api/retail-data?period=3m' }));
    const w = periodDateWindow('3m', dhakaToday());
    check('proxy: demo ?period=3m -> 200, fixture 3m total 185000', res.statusCode === 200 && json?.demo === true && json?.totalPremium === 185000, `status=${res.statusCode} total=${json?.totalPremium}`);
    check('proxy: demo ?period=3m echoes period + window', json?.period === '3m' && JSON.stringify(json?.periodWindow) === JSON.stringify(w), `${json?.period} ${JSON.stringify(json?.periodWindow)}`);
  }
  {
    // Default period is Today now: a bare call returns the today
    // window (fixture: D1001's two records, 35000).
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const { res, json } = await call(mockReq({ token: t }));
    check('proxy: default period is today (fixture total 35000)', res.statusCode === 200 && json?.period === 'today' && json?.totalPremium === 35000, `status=${res.statusCode} period=${json?.period} total=${json?.totalPremium}`);
    const { res: resT, json: jsonT } = await call(mockReq({ token: t, url: '/api/retail-data?period=today' }));
    check('proxy: explicit ?period=today -> same as default', resT.statusCode === 200 && jsonT?.totalPremium === 35000 && jsonT?.period === 'today', `status=${resT.statusCode} total=${jsonT?.totalPremium}`);
  }
  {
    // Custom ranges through the handler: a valid range returns
    // exactly the rows inside it, and echoes period='custom' + the
    // window. [1st of month, today] must equal this-month.
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const todayIso = dhakaToday();
    const monthStart = `${todayIso.slice(0, 7)}-01`;
    const { res: resTm, json: jsonTm } = await call(mockReq({ token: t, url: '/api/retail-data?period=this-month' }));
    const { res, json } = await call(mockReq({ token: t, url: `/api/retail-data?period=custom&from=${monthStart}&to=${todayIso}` }));
    check('proxy: custom [month-start, today] -> 200', res.statusCode === 200, String(res.statusCode));
    check('proxy: custom == this-month total + policies', res.statusCode === 200 && json?.totalPremium === jsonTm?.totalPremium && json?.policies === jsonTm?.policies, `custom=${json?.totalPremium} (${json?.policies}) vs this-month=${jsonTm?.totalPremium} (${jsonTm?.policies})`);
    check('proxy: custom echoes period + window', json?.period === 'custom' && json?.periodWindow?.start === monthStart && json?.periodWindow?.end === todayIso, `${json?.period} ${JSON.stringify(json?.periodWindow)}`);
    // A named period with from/to ignores the range.
    const { res: resNamed, json: jsonNamed } = await call(mockReq({ token: t, url: `/api/retail-data?period=3m&from=${monthStart}&to=${todayIso}` }));
    check('proxy: named period + from/to ignores the range', resNamed.statusCode === 200 && jsonNamed?.period === '3m' && jsonNamed?.totalPremium === 185000, `period=${jsonNamed?.period} total=${jsonNamed?.totalPremium}`);
  }
  {
    // Invalid custom ranges are 400s, never silent fallbacks.
    const t = signToken({ sub: '9990004', name: 'Demo Admin', role: 'admin' });
    const todayIso = dhakaToday();
    const cases = [
      ['custom without a range', '/api/retail-data?period=custom'],
      ['custom with only from', `/api/retail-data?period=custom&from=2026-11-01`],
      ['custom from > to', '/api/retail-data?period=custom&from=2026-11-20&to=2026-11-01'],
      ['custom to in the future', `/api/retail-data?period=custom&from=2026-11-01&to=2099-01-01`],
      ['custom range over 2 years', '/api/retail-data?period=custom&from=2020-01-01&to=2026-11-20'],
      ['custom bad date', '/api/retail-data?period=custom&from=2026-02-30&to=2026-11-20'],
      ['custom bad format', '/api/retail-data?period=custom&from=01-11-2026&to=2026-11-20'],
    ];
    for (const [name, url] of cases) {
      const { res } = await call(mockReq({ token: t, url }));
      check(`proxy: ${name} -> 400`, res.statusCode === 400, String(res.statusCode));
    }
    // 'today' is a valid period even with a from/to attached (ignored).
    const { res } = await call(mockReq({ token: t, url: `/api/retail-data?period=today&from=2026-11-01&to=${todayIso}` }));
    check('proxy: today + from/to ignores the range (200)', res.statusCode === 200, String(res.statusCode));
  }
  {
    // Two periods cached separately: the live payload is fetched once
    // (shared cache), but each period gets its own index — the 3m and
    // this-month summaries must differ (live data spans years).
    const t = signToken({ sub: '2025019', name: 'Staff', role: 'admin' });
    const before = fetchCalls;
    const { res: res3m, json: json3m } = await call(mockReq({ token: t, url: '/api/retail-data?period=3m' }));
    const { res: resTm, json: jsonTm } = await call(mockReq({ token: t, url: '/api/retail-data?period=this-month' }));
    check('proxy: live 3m vs this-month -> different totals', res3m.statusCode === 200 && resTm.statusCode === 200 && json3m?.totalPremium !== jsonTm?.totalPremium, `3m=${json3m?.totalPremium} this-month=${jsonTm?.totalPremium}`);
    check('proxy: live 3m vs this-month -> no extra payload fetch', fetchCalls === before, `${fetchCalls - before} extra fetches`);
    check('proxy: live ?period=3m echoes period', json3m?.period === '3m', String(json3m?.period));
  }
  check('proxy: retail fetch cached (1 call)', fetchCalls === 1, `${fetchCalls} calls`);
  globalThis.fetch = realFetch;
}

// ---- 8. Mixed-version tolerance (client validation + SW cache) ----
{
  // 2026-11-20 live bug: after the c48ac65 push, a browser running the
  // new bundle against the OLD deployment's proxy (Vercel skew pin)
  // failed client validation — the old proxy response has no
  // newPremium/deferredPremium — and the whole retail feed fell back
  // to demo while LeadFlow/Learning stayed Live. The client must
  // accept the old shape and default the two fields to 0. This tests
  // the REAL client module with fetch stubbed.
  const { register } = await import('node:module');
  register('./qa-ts-resolve-hooks.mjs', import.meta.url);

  // Minimal sessionStorage for the client module (Node has none).
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };

  const { loadRetailFresh, loadRetailCached } = await import('../src/data/retailData.ts');
  const { ALL_TIME_SELECTION } = await import('../src/data/period.ts');

  // Old-shape response: the live admin summary with the two c48ac65
  // fields removed — everything else valid.
  const oldShape = { ...admin };
  delete oldShape.newPremium;
  delete oldShape.deferredPremium;

  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => oldShape });
  const fresh = await loadRetailFresh('test-token', '2025019', ALL_TIME_SELECTION);
  check('old-shape: fresh load passes validation', fresh.summary.totalPremium === admin.totalPremium && fresh.summary.fycp === admin.fycp, `total=${fresh.summary.totalPremium}`);
  check('old-shape: newPremium/deferredPremium default to 0', fresh.summary.newPremium === 0 && fresh.summary.deferredPremium === 0, `${fresh.summary.newPremium} / ${fresh.summary.deferredPremium}`);
  check('old-shape: not demo (live feed stays live)', fresh.summary.demo === false);
  // The fresh load cached the NORMALIZED summary — the cached path
  // must serve it back with the 0 defaults too.
  const cached = loadRetailCached('2025019', ALL_TIME_SELECTION);
  check('old-shape: cached load returns normalized 0 defaults', cached !== null && cached.fromCache === true && cached.summary.newPremium === 0 && cached.summary.deferredPremium === 0, cached ? `${cached.summary.newPremium} / ${cached.summary.deferredPremium}` : 'null');
  // A cache entry written by an OLD client (fields absent on disk)
  // must normalize on read, not be discarded.
  const cacheKey = [...store.keys()][0];
  store.clear();
  globalThis.sessionStorage.setItem(cacheKey, JSON.stringify({ summary: oldShape, employeeId: '2025019', syncedAt: Date.now() }));
  const cachedOld = loadRetailCached('2025019', ALL_TIME_SELECTION);
  check('old-shape: old-client cache entry normalizes on read', cachedOld !== null && cachedOld.summary.newPremium === 0 && cachedOld.summary.deferredPremium === 0, cachedOld ? 'normalized' : 'discarded');
  // Other required checks are unchanged: a shape missing totalPremium
  // must still throw.
  const badShape = { ...oldShape };
  delete badShape.totalPremium;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => badShape });
  let threw = false;
  try {
    await loadRetailFresh('test-token', '2025019', ALL_TIME_SELECTION);
  } catch {
    threw = true;
  }
  check('old-shape: shape missing totalPremium still throws', threw);
  // New-shape responses pass through unchanged.
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => admin });
  const freshNew = await loadRetailFresh('test-token', '2025019', ALL_TIME_SELECTION);
  check('new-shape: new/deferred values pass through', freshNew.summary.newPremium === admin.newPremium && freshNew.summary.deferredPremium === admin.deferredPremium, `${freshNew.summary.newPremium} / ${freshNew.summary.deferredPremium}`);
  globalThis.fetch = realFetch2;

  // Service worker cache bump: the shell changed in c48ac65, so the
  // cache name must be v2 (v1 would keep serving the stale shell).
  const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  check('sw.js: cache name is agent-hub-shell-v2', sw.includes("CACHE_NAME = 'agent-hub-shell-v2'"));
  check('sw.js: no v1 cache name left', !sw.includes('agent-hub-shell-v1'));
}

// ---- 9. Retail-app reconciliation (stubbed payload) ----
{
  // The fixture cannot distinguish the MTD window (all its dues fall
  // on/before the 20th) or the ever-sold rule (all 4 FAs have sold),
  // so §9 mutates a fixture COPY: a due AFTER today but inside the
  // month, a due inside the window with premium != duePrem, and a
  // never-sold FA in the directory. The retail app is authoritative
  // for retail figures — these are its definitions (dist/index.html
  // pdDueRowsForWindow + the MTD default preset; api/sales-data.js
  // producers `activity`).
  const fx = buildDemoPayload(FIXTURE_TODAY);
  const dueStub = ({ policy, faCode, nextDue, premium, duePrem }) => ({
    policy,
    owner: 'Demo Customer',
    nextDue,
    product: 'Shanta Endowment (With Profit) Plan',
    term: '10',
    dueInstl: 0,
    premium,
    duePrem,
    mode: 'Monthly',
    status: 'Inforce',
    faCode,
    beCode: 'DMO',
    premiumReceived: 0,
    lapseTiming: 'Regular',
    commYear: 2025,
    commMonth: 6,
    commDate: '2025-06-15',
  });
  // A due on Nov 25 — inside the month, AFTER today (Nov 20): the
  // MTD figure must NOT include it (the old full-month definition
  // would have: 48,000 / 6 pol).
  fx.duePolicies.push(dueStub({ policy: 'X9025', faCode: '9990001', nextDue: '2026-11-25', premium: 10000, duePrem: 0 }));
  // A due inside the MTD window with premium != duePrem: the figure
  // sums `premium` (7,000), NOT `duePrem` (70,000). Nov 18 is also
  // inside the week (Sun 15 – Sat 21), so the week figure moves too.
  fx.duePolicies.push(dueStub({ policy: 'X9018', faCode: '9990001', nextDue: '2026-11-18', premium: 7000, duePrem: 70000 }));
  // A never-sold FA (directory + producers, no records): in the
  // universe, not active.
  fx.producerDirectory.push({ code: '9990099', name: 'Demo FA Never Sold', tier: 'FA', selfCode: '', beCode: 'DMO', be: 'Demo BE', ownerCode: '9990099', ownerName: 'Demo FA Never Sold', ownerTier: 'FA', ownerBeCode: 'DMO', ownerBe: 'Demo BE', parentOwnerCode: '9990002', parentOwnerTier: 'UM' });
  fx.producers.push({ code: '9990099', aliases: ['9990099'], name: 'Demo FA Never Sold', beCode: 'DMO', be: 'Demo BE', beSource: 'recruit', district: '', designation: 'FA', activity: 'Inactive', reason: '', joined: '2025-01-10', lastPremiumDate: '', lastPremiumMonth: '' });

  const adm = summarizeRetail(fx, { employeeId: '9990004', role: 'admin' }, FIXTURE_TODAY);
  check('recon MTD: Nov 25 due excluded (due 45000, 6 pol)', adm.duePremium === 45000 && adm.duePolicies === 6, `${adm.duePremium} (${adm.duePolicies})`);
  check('recon MTD: premium summed, not duePrem (7000 not 70000)', adm.duePremium === 38000 + 7000, String(adm.duePremium));
  check('recon MTD: overdue Oct due still excluded', adm.duePremium === 45000, String(adm.duePremium));
  check('recon week: Nov 18 due inside the week (24000, 3 pol)', adm.duesThisWeek.count === 3 && adm.duesThisWeek.amount === 24000, JSON.stringify(adm.duesThisWeek));
  check('recon week: Nov 25 due outside the week', adm.duesThisWeek.amount === 17000 + 7000, String(adm.duesThisWeek.amount));
  check('recon ever-sold: never-sold FA in universe, not active (4 of 5)', adm.activeFas.active === 4 && adm.activeFas.total === 5, JSON.stringify(adm.activeFas));
  check('recon dueRows: top 3 unchanged by the later dues', JSON.stringify(adm.dueRows.map((r) => [r.nextDue, r.premium])) === JSON.stringify([['2026-10-10', 3000], ['2026-11-10', 5000], ['2026-11-12', 4000]]), JSON.stringify(adm.dueRows));

  const lead = summarizeRetail(fx, { employeeId: '9990002', role: 'team_lead' }, FIXTURE_TODAY);
  check('recon lead: never-sold FA in team universe (3 of 4)', lead.activeFas.active === 3 && lead.activeFas.total === 4, JSON.stringify(lead.activeFas));
  const emp = summarizeRetail(fx, { employeeId: '9990001', role: 'employee' }, FIXTURE_TODAY);
  check('recon emp: due 24000 (3 pol) — Nov 18 in, Nov 25 out', emp.duePremium === 24000 && emp.duePolicies === 3, `${emp.duePremium} (${emp.duePolicies})`);
  check('recon emp: week 7000 (1 pol) — only the Nov 18 due', emp.duesThisWeek.count === 1 && emp.duesThisWeek.amount === 7000, JSON.stringify(emp.duesThisWeek));
}

console.log(
  `\nLIVE RETAIL KPIs — Total premium ${fmt(admin.totalPremium)} · FYCP ${fmt(admin.fycp)} · Policies ${admin.policies} · ` +
    `Due ${fmt(admin.duePremium)} (${admin.duePolicies} pol, ${admin.dueMonth}) · Persistency ${admin.persistency ? `${admin.persistency.pct.toFixed(1)}% (${admin.persistency.inf}/${admin.persistency.all})` : '—'} · ` +
    `Active FAs ${admin.activeFas.active} of ${admin.activeFas.total} · Unassigned ${fmt(admin.unassigned?.premium ?? 0)} · ` +
    `Top BE ${admin.leaderboard.entries[0]?.name ?? '(none)'} ${fmt(admin.leaderboard.entries[0]?.premium ?? 0)}`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} retail live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
