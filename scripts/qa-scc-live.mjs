/**
 * Milestone 3 — live SCC data check (Node, no browser).
 *
 * Usage: `npm run qa:scc-live`.
 *
 * Fetches the Sales Command Center's public gviz CSVs live and runs the
 * Hub's OWN production parser + aggregation code (src/data/sccParse.ts,
 * imported directly — Node 24 type-strips .ts) against them. This is the
 * live-data proof for the Dashboard page: the in-browser QA
 * (scripts/qa-screenshots.mjs) cannot exercise the live fetch because this
 * VM's headless Chrome has no external network.
 *
 * Asserts: both tabs fetch (HTTP 200); the parse yields a realistic
 * producer/session count; every KPI is sane and internally consistent
 * (trained + untrained == total agents; leaderboard sums <= totals);
 * the leaderboard is sorted, ranked 1–5, and contains no orphan
 * placeholder names (the standing orphan rule).
 *
 * Read-only: two GET requests to the public gviz endpoint, no writes.
 * Exits non-zero if any check fails.
 */
import { summarize } from '../src/data/sccParse.ts';

const SHEET_ID = '1u_EVyLhcUwiqEJgY1sO2-iN8GdsUW_tOB5_csNrrUco';
const gvizUrl = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchTab(tab) {
  const res = await fetch(gvizUrl(tab), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const producerCsv = await fetchTab('Producer info');
check('gviz Producer info: HTTP 200, substantial CSV', producerCsv.length > 100_000, `${producerCsv.length} bytes`);
const sessionCsv = await fetchTab('Training Data');
check('gviz Training Data: HTTP 200, non-empty CSV', sessionCsv.length > 100, `${sessionCsv.length} bytes`);

// Live-sheet caveat (informational — the design adapts to it, see sccParse.ts):
const hasBeName = producerCsv.split('\n')[0].toUpperCase().includes('BE NAME');
console.log(`INFO  Producer info has a BE Name column: ${hasBeName} (Hub groups the leaderboard by GM)`);

const summary = summarize(producerCsv, sessionCsv);
const { sales, training, leaderboard } = summary;

check('parse: producer rows', summary.producers.length > 1000, `${summary.producers.length} rows`);
check('parse: session rows', summary.sessions.length > 0, `${summary.sessions.length} rows`);
check('parse: sessions OK', summary.sessionsOk === true);

check('sales: new premium > 0', sales.totalVolume > 0, `৳${sales.totalVolume.toLocaleString('en-IN')}`);
check('sales: policy qty > 0', sales.totalQty > 0, `${sales.totalQty}`);
check('sales: lifetime premium > 0', sales.lifeTime > 0, `৳${sales.lifeTime.toLocaleString('en-IN')}`);
check('sales: active producers > 0', sales.activeProducers > 0, `${sales.activeProducers}`);
check('sales: avg premium/FA > 0', sales.avgPremium > 0, `৳${sales.avgPremium.toLocaleString('en-IN')}`);
check('sales: avg policies/FA > 0', parseFloat(sales.avgPolicy) > 0, sales.avgPolicy);

check('training: sessions > 0', training.totalSessions > 0, `${training.totalSessions}`);
check('training: participants > 0', training.totalParticipants > 0, `${training.totalParticipants}`);
check('training: cost > 0', training.totalCost > 0, `৳${training.totalCost.toLocaleString('en-IN')}`);
check('training: active FAs > 0', training.totalAgents > 0, `${training.totalAgents}`);
check(
  'training: trained + untrained == total agents',
  training.trainedCount + training.untrainedCount === training.totalAgents,
  `${training.trainedCount} + ${training.untrainedCount} == ${training.totalAgents}`,
);
check(
  'training: gap percent in [0, 100]',
  training.gapPercent >= 0 && training.gapPercent <= 100,
  `${training.gapPercent}%`,
);
check(
  'training: trained percent in [0, 100]',
  training.trainingPercent >= 0 && training.trainingPercent <= 100,
  `${training.trainingPercent}%`,
);

check(
  'leaders: 1–5 ranked GMs',
  leaderboard.top.length >= 1 && leaderboard.top.length <= 5,
  `${leaderboard.top.length} entries`,
);
const sorted = leaderboard.top.every((e, i, a) => i === 0 || a[i - 1].premium >= e.premium);
check('leaders: sorted by premium desc', sorted);
const orphanInTop = leaderboard.top.some((e) => {
  const k = e.name.toLowerCase().trim();
  return k === '#n/a' || k.replace(/[^a-z0-9]/g, '') === 'shantalifeinsuranceplc';
});
check('leaders: no orphan placeholder in the ranking', !orphanInTop);
check('leaders: top premium > 0', (leaderboard.top[0]?.premium ?? 0) > 0);
check(
  'leaders: unassigned bucket present (orphan rows exist)',
  leaderboard.unassigned !== null && leaderboard.unassigned.premium > 0 && leaderboard.unassigned.count > 0,
  leaderboard.unassigned
    ? `৳${leaderboard.unassigned.premium.toLocaleString('en-IN')} · ${leaderboard.unassigned.count} rows`
    : 'none',
);

const rankedPremium =
  leaderboard.top.reduce((a, e) => a + e.premium, 0) + (leaderboard.unassigned?.premium ?? 0);
check(
  'consistency: ranked + unassigned premium <= total new premium',
  rankedPremium <= sales.totalVolume,
  `${rankedPremium.toLocaleString('en-IN')} <= ${sales.totalVolume.toLocaleString('en-IN')}`,
);
const rankedQty = leaderboard.top.reduce((a, e) => a + e.qty, 0) + (leaderboard.unassigned?.qty ?? 0);
check(
  'consistency: ranked + unassigned qty <= total policy qty',
  rankedQty <= sales.totalQty,
  `${rankedQty} <= ${sales.totalQty}`,
);

console.log(
  `\nLIVE KPIs — New premium ৳${sales.totalVolume.toLocaleString('en-IN')} · Policies ${sales.totalQty} · ` +
    `Lifetime ৳${sales.lifeTime.toLocaleString('en-IN')} · Active FAs ${sales.activeProducers} · ` +
    `Sessions ${training.totalSessions} · Participants ${training.totalParticipants} · ` +
    `FA trained ${training.trainingPercent}% · Gap ${training.gapPercent}%`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
