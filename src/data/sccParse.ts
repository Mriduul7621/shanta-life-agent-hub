/**
 * Sales Command Center data — pure parser + aggregation (Milestone 3).
 *
 * PURE MODULE: no browser APIs, no fetch — so the Node QA check
 * (scripts/qa-scc-live.mjs) can import this exact production code and run
 * it against the live CSVs. The browser fetch + cache live in sccData.ts.
 *
 * Source (verified 2026-11-20, see M3_DESIGN.md §3): the SCC's own Google
 * Sheet, fetched as public gviz CSV — the same tabs, the same header-alias
 * mapping and the same KPI formulas as Training-Dashboard_Shanta-Life
 * (main @ 509a5d13), App.tsx `handleConnectSheet`, SalesDashboard.tsx and
 * TrainingDashboard.tsx. The sheet ID is public (from the SCC's public
 * repo) — no secret is involved.
 *
 * Fidelity notes (deliberate, documented deviations from the SCC code):
 * 1. CSV parsing: the SCC splits rows on newlines naively, which breaks on
 *    the quoted `"IDRA Training\nStatus"` header (embedded LF) and creates
 *    one phantom empty row. This parser is quote-aware (RFC 4180) and
 *    handles embedded newlines and `""` escapes correctly. The phantom row
 *    contributes zero to every KPI, so results are identical.
 * 2. Leaderboard: the live `Producer info` sheet has NO `BE Name`/`BE Code`
 *    columns, so the SCC's BE leaderboard is empty in practice. The Hub
 *    groups by GM instead (the highest level present in the data).
 * 3. Orphan rule: rows whose resolved GM is the company placeholder
 *    (`SHANTA LIFE INSURANCE PLC`), `#N/A`, or empty are EXCLUDED from the
 *    ranking and collected into one separate `unassigned` bucket (the
 *    standing retail orphan rule — never rank a placeholder as a person,
 *    never merge it into a real GM's total). The SCC ranks them literally.
 */

export interface SccProducer {
  empidOld: string;
  producerName: string;
  gender: string;
  tier: string;
  beCode: string;
  beName: string;
  gmName: string;
  dgmName: string;
  bmName: string;
  umName: string;
  contactNo: string;
  mailingDistrict: string;
  joiningDate: string;
  noOfNewPolicy: number;
  newPolicyPremium: number;
  lifeTimePremium: number;
  statusActivity: string;
  policyIssueDate: string;
  productName: string;
  paymentMode: string;
  saleDate: string;
  basicTraining: boolean;
  dateOfTrainingBasic: string;
  reviewSession: boolean;
  dateOfTrainingReview: string;
  foundationTraining: boolean;
  dateOfTrainingFoundation: string;
  idraRequired: boolean;
  serviceLength: string;
  saleYear: string;
  saleMonth: string;
}

export interface SccSession {
  trainingDate: string;
  trainingName: string;
  typeOfTraining: string;
  participantCount: number;
  trainingDuration: string;
  trainingCost: number;
  trainingYear: string;
  trainingMonth: string;
}

export interface SccSalesStats {
  totalVolume: number;
  totalQty: number;
  lifeTime: number;
  activeProducers: number;
  avgPremium: number;
  /** One decimal, as the SCC renders it (string to preserve e.g. "6.0"). */
  avgPolicy: string;
}

export interface SccTrainingStats {
  totalSessions: number;
  totalParticipants: number;
  totalCost: number;
  totalAgents: number;
  trainedCount: number;
  /** One decimal. */
  trainingPercent: number;
  basicTrained: number;
  reviewTrained: number;
  foundationTrained: number;
  untrainedCount: number;
  /** One decimal. */
  gapPercent: number;
}

export interface LeaderboardEntry {
  name: string;
  premium: number;
  qty: number;
}

export interface SccLeaderboard {
  top: LeaderboardEntry[];
  /** Placeholder/empty-GM rows, kept out of the ranking (orphan rule). */
  unassigned: { premium: number; qty: number; count: number } | null;
}

export interface SccSummary {
  producers: SccProducer[];
  sessions: SccSession[];
  /** False when the Training Data tab failed to load (SCC tolerates this). */
  sessionsOk: boolean;
  sales: SccSalesStats;
  training: SccTrainingStats;
  leaderboard: SccLeaderboard;
}

/** Quote-aware CSV parse (RFC 4180): quoted fields, `""` escapes, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      fieldStarted = false;
      // Skip wholly empty lines (SCC filters blank lines too).
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }
  return rows;
}

type HeaderMap = Map<string, number>;

function headerIndex(rows: string[][]): HeaderMap {
  const map: HeaderMap = new Map();
  const headers = rows[0] ?? [];
  headers.forEach((h, i) => {
    // SCC: trim, strip quotes, collapse whitespace, UPPERCASE. First match wins.
    const key = h.trim().replace(/"/g, '').replace(/\s+/g, ' ').toUpperCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

function getVal(row: string[], headers: HeaderMap, aliases: string[]): string {
  for (const alias of aliases) {
    const i = headers.get(alias.toUpperCase());
    if (i !== undefined) return (row[i] ?? '').trim();
  }
  return '';
}

function numOf(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function intOf(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function yesOf(value: string): boolean {
  return value.toLowerCase().trim() === 'yes';
}

/** `Producer info` tab → producers. Header aliases copied from the SCC's `handleConnectSheet`. */
export function parseProducerCsv(text: string): SccProducer[] {
  const rows = parseCsv(text);
  if (rows.length < 1) return [];
  const headers = headerIndex(rows);
  return rows.slice(1).map((row) => {
    const policyDateStr = getVal(row, headers, ['Policy Issue Date', 'PR DATE', 'JOINING DATE']);
    const d = new Date(policyDateStr);
    const rawIdra = getVal(row, headers, ['IDRA Training'])
      .replace(/\u00a0/g, ' ')
      .trim()
      .toLowerCase();
    return {
      empidOld: getVal(row, headers, ['EMPID OLD', 'Producer Code', 'EmpID']),
      producerName: getVal(row, headers, ['PRODUCER NAME', 'Producer Name', 'FA Name']),
      gender: getVal(row, headers, ['GENDER', 'Gender', 'Sex']),
      tier: getVal(row, headers, ['TIER', 'Grade', 'Grade ', 'FA TIER']),
      beCode: getVal(row, headers, ['BE Code', 'BE CODE']),
      beName: getVal(row, headers, ['BE Name', 'BE NAME']),
      gmName: getVal(row, headers, ['GM Name', 'GM NAME']),
      dgmName: getVal(row, headers, ['DGM Name', 'DGM NAME', 'AGM Name', 'AGM NAME']),
      bmName: getVal(row, headers, ['BM Name', 'BM NAME']),
      umName: getVal(row, headers, ['UM Name', 'UM NAME']),
      contactNo: getVal(row, headers, ['CONTACT NO', 'Contact No', 'Phone']),
      mailingDistrict: getVal(row, headers, ['MAILING District', 'District']),
      joiningDate: getVal(row, headers, ['JOINING DATE', 'Joining Date']),
      noOfNewPolicy: intOf(getVal(row, headers, ['No of New Policy', 'Policies'])),
      newPolicyPremium: numOf(getVal(row, headers, ['New Policy Premium', 'Premium'])),
      lifeTimePremium: numOf(getVal(row, headers, ['Life Time Premium'])),
      statusActivity: getVal(row, headers, ['STATUS ACTIVITY', 'Status', 'Activity Status']) || 'Inactive',
      policyIssueDate: policyDateStr,
      productName: getVal(row, headers, ['Product Name', 'Plan']),
      paymentMode: getVal(row, headers, ['Payment Mode', 'Mode']),
      saleDate: getVal(row, headers, ['Sale Date']),
      basicTraining: yesOf(getVal(row, headers, ['Basic Training'])),
      dateOfTrainingBasic: getVal(row, headers, ['Date Of Training (Basic)']),
      reviewSession: yesOf(getVal(row, headers, ['Review Session'])),
      dateOfTrainingReview: getVal(row, headers, ['Date Of Training (Review)']),
      foundationTraining: yesOf(getVal(row, headers, ['Foundation Training'])),
      dateOfTrainingFoundation: getVal(row, headers, ['Date Of Training (Foundation)']),
      idraRequired: rawIdra === 'required',
      serviceLength: getVal(row, headers, ['Service Length', 'Service Length ']),
      saleYear: !Number.isNaN(d.getFullYear()) ? d.getFullYear().toString() : 'N/A',
      saleMonth: !Number.isNaN(d.getMonth()) ? (d.getMonth() + 1).toString() : 'N/A',
    };
  });
}

/** `Training Data` tab → sessions. Header aliases copied from the SCC's `handleConnectSheet`. */
export function parseSessionCsv(text: string): SccSession[] {
  const rows = parseCsv(text);
  if (rows.length < 1) return [];
  const headers = headerIndex(rows);
  return rows.slice(1).map((row) => {
    const tDateStr = getVal(row, headers, ['Training Date', 'Date']);
    const td = new Date(tDateStr);
    return {
      trainingDate: tDateStr,
      trainingName: getVal(row, headers, ['Training Name', 'Name', 'Session']),
      typeOfTraining: getVal(row, headers, ['Type of Training', 'Type']),
      participantCount: intOf(getVal(row, headers, ['Participant', 'Attendees', 'No of Participants'])),
      trainingDuration: getVal(row, headers, ['Training Duration', 'Duration']),
      trainingCost: numOf(getVal(row, headers, ['Training Cost', 'Cost'])),
      trainingYear: !Number.isNaN(td.getFullYear()) ? td.getFullYear().toString() : 'N/A',
      trainingMonth: !Number.isNaN(td.getMonth()) ? (td.getMonth() + 1).toString() : 'N/A',
    };
  });
}

const isActive = (p: SccProducer): boolean => p.statusActivity.toLowerCase() === 'active';
const isFaTier = (p: SccProducer): boolean => p.tier.toUpperCase().trim() === 'FA';
/** Training stats count FA + FIELD ASSOCIATE tiers (SCC TrainingDashboard). */
const isFaLikeTier = (p: SccProducer): boolean => {
  const tier = p.tier.toUpperCase().trim();
  return tier === 'FA' || tier === 'FIELD ASSOCIATE';
};
const isTrained = (p: SccProducer): boolean =>
  p.basicTraining || p.foundationTraining || p.reviewSession;

/** Sales KPIs — same formulas as SCC SalesDashboard (no period filter in the Hub: all rows). */
export function computeSalesStats(producers: SccProducer[]): SccSalesStats {
  const totalVolume = producers.reduce((a, p) => a + p.newPolicyPremium, 0);
  const totalQty = producers.reduce((a, p) => a + p.noOfNewPolicy, 0);
  const lifeTime = producers.reduce((a, p) => a + p.lifeTimePremium, 0);
  const activeProducers = producers.filter((p) => isActive(p) && isFaTier(p)).length;
  return {
    totalVolume,
    totalQty,
    lifeTime,
    activeProducers,
    avgPremium: activeProducers > 0 ? Math.round(totalVolume / activeProducers) : 0,
    avgPolicy: activeProducers > 0 ? (totalQty / activeProducers).toFixed(1) : '0',
  };
}

/** Training KPIs — same formulas as SCC TrainingDashboard. */
export function computeTrainingStats(producers: SccProducer[], sessions: SccSession[]): SccTrainingStats {
  const totalSessions = sessions.length;
  const totalParticipants = sessions.reduce((a, s) => a + s.participantCount, 0);
  const totalCost = sessions.reduce((a, s) => a + s.trainingCost, 0);
  const activeData = producers.filter((p) => isActive(p) && isFaLikeTier(p));
  const totalAgents = activeData.length;
  const trainedCount = activeData.filter(isTrained).length;
  const untrainedCount = totalAgents - trainedCount;
  return {
    totalSessions,
    totalParticipants,
    totalCost,
    totalAgents,
    trainedCount,
    trainingPercent: totalAgents > 0 ? parseFloat(((trainedCount / totalAgents) * 100).toFixed(1)) : 0,
    basicTrained: activeData.filter((p) => p.basicTraining).length,
    reviewTrained: activeData.filter((p) => p.reviewSession).length,
    foundationTrained: activeData.filter((p) => p.foundationTraining).length,
    untrainedCount,
    gapPercent: totalAgents > 0 ? parseFloat(((untrainedCount / totalAgents) * 100).toFixed(1)) : 0,
  };
}

/** SCC `resolveKey` for a leader name: orphan/N/A GM falls back to the BE name. */
function resolveLeaderKey(p: SccProducer): string {
  const key = (p.gmName || '').trim();
  const lower = key.toLowerCase();
  if (!key || lower === 'n/a' || lower === 'shanta life insurance plc') {
    const be = (p.beName || '').trim();
    if (be) return be;
  }
  return key;
}

/** Orphan placeholder, never ranked as a person (standing retail orphan rule). */
function isOrphanKey(key: string): boolean {
  if (!key) return true;
  const lower = key.toLowerCase().trim();
  if (lower === '#n/a' || lower === 'n/a') return true;
  return lower.replace(/[^a-z0-9]/g, '') === 'shantalifeinsuranceplc';
}

/** Top-5 GMs by new premium (Active rows only), orphans in a separate bucket. */
export function computeLeaderboard(producers: SccProducer[]): SccLeaderboard {
  const groups = new Map<string, { premium: number; qty: number }>();
  const unassigned = { premium: 0, qty: 0, count: 0 };
  for (const p of producers) {
    if (!isActive(p)) continue;
    const key = resolveLeaderKey(p);
    if (isOrphanKey(key)) {
      unassigned.premium += p.newPolicyPremium;
      unassigned.qty += p.noOfNewPolicy;
      unassigned.count += 1;
      continue;
    }
    const g = groups.get(key) ?? { premium: 0, qty: 0 };
    g.premium += p.newPolicyPremium;
    g.qty += p.noOfNewPolicy;
    groups.set(key, g);
  }
  const top = [...groups.entries()]
    .map(([name, v]) => ({ name, premium: v.premium, qty: v.qty }))
    .sort((a, b) => b.premium - a.premium)
    .slice(0, 5);
  return { top, unassigned: unassigned.count > 0 ? unassigned : null };
}

export function summarize(producerCsv: string, sessionCsv: string | null): SccSummary {
  const producers = parseProducerCsv(producerCsv);
  const sessions = sessionCsv === null ? [] : parseSessionCsv(sessionCsv);
  return {
    producers,
    sessions,
    sessionsOk: sessionCsv !== null,
    sales: computeSalesStats(producers),
    training: computeTrainingStats(producers, sessions),
    leaderboard: computeLeaderboard(producers),
  };
}
