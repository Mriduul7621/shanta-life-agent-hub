/**
 * Demo home-screen data, per role — Milestone 1, extended in Milestone 3.
 *
 * Clearly fictional, labelled DEMO in the UI, and deliberately different per
 * role so each role view is verifiable:
 * - Employee: own numbers only.
 * - Team Lead: own numbers + a team section.
 * - Manager: downline totals (bigger numbers, team section).
 * - Admin: zero states everywhere (never-empty rule: cards say so plainly).
 *
 * The Dashboard page loads REAL Retail Sales data, role-scoped, via the
 * Hub-side proxy (see api/retail-data.js and src/data/retailData.ts) —
 * and Phase 2 wires the Home widgets and the Leads/Learning pages to
 * the same retail proxy plus the LeadFlow and Learning Hub proxies
 * (api/leadflow-data.js, api/learning-data.js). This file stays the
 * FALLBACK: while a feed is loading, unreachable, or the user is a
 * demo account on a build without the proxies, the pages show these
 * fictional figures, always labelled DEMO. The due-premium rows below
 * stay DEMO-only by design: the real due feed is a summary (count +
 * amount for the month — see DuePremiumsWidget live mode), never
 * policy-wise rows, because the due list would expose customer PII.
 */
import type { Role } from '../auth/types';

/** One due premium — shape mirrors the verified Due & Lapse mapping. */
export interface DueRow {
  /** Fictional in demo data: DEMO-#### — never a real policy number. */
  policy: string;
  /** Fictional in demo data: "Demo Customer …" — never a real person. */
  owner: string;
  /** Next premium date, ISO YYYY-MM-DD. */
  nextDue: string;
  /** Premium for this instalment (the `Premium` column). */
  premium: number;
  /** Outstanding backlog (the `Due Prem.` column); shown on overdue rows. */
  duePrem: number;
  status: 'Inforce';
}

export interface WidgetData {
  followups: number;
  followupsAmountNote?: string;
  dues: number;
  duesAmountBdt: number;
  /** Demo due rows for the Due-premium widget (fictional — see above). */
  dueRows: DueRow[];
  learningCourse: string | null;
  /** Team widgets only: how many members are learning (subtitle is localised). */
  learningMembersCount?: number;
  learningProgressPct: number;
  businessFycpBdt: number;
}

/** ISO date N days from today (local date) — demo due dates stay relative so the widget never goes stale. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dueRow(policy: string, owner: string, inDays: number, premium: number, duePrem = 0): DueRow {
  return { policy, owner, nextDue: daysFromNow(inDays), premium, duePrem, status: 'Inforce' };
}

export interface RoleDashboard {
  own: WidgetData;
  team: WidgetData | null;
  teamSize: number;
}

const EMPLOYEE: RoleDashboard = {
  own: {
    followups: 3,
    dues: 2,
    duesAmountBdt: 48500,
    // Due-this-week rows sum to the card total (28,500 + 20,000 = 48,500).
    dueRows: [
      dueRow('DEMO-0001', 'Demo Customer A', 2, 28500),
      dueRow('DEMO-0002', 'Demo Customer B', 5, 20000),
      dueRow('DEMO-0003', 'Demo Customer C', -3, 12000, 12000),
    ],
    learningCourse: 'The Art of Selling — Communication Masterclass',
    learningProgressPct: 60,
    businessFycpBdt: 185000,
  },
  team: null,
  teamSize: 0,
};

const TEAM_LEAD: RoleDashboard = {
  own: {
    followups: 4,
    dues: 1,
    duesAmountBdt: 21200,
    dueRows: [
      dueRow('DEMO-0011', 'Demo Customer D', 3, 21200),
      dueRow('DEMO-0012', 'Demo Customer E', -6, 8400, 8400),
    ],
    learningCourse: 'The Art of Selling — Communication Masterclass',
    learningProgressPct: 80,
    businessFycpBdt: 240000,
  },
  team: {
    followups: 12,
    dues: 8,
    duesAmountBdt: 196400,
    // Due-this-week rows sum to the card total (196,400).
    dueRows: [
      dueRow('DEMO-0021', 'Demo Customer F', 1, 35000),
      dueRow('DEMO-0022', 'Demo Customer G', 1, 32000),
      dueRow('DEMO-0023', 'Demo Customer H', 2, 28000),
      dueRow('DEMO-0024', 'Demo Customer I', 3, 24000),
      dueRow('DEMO-0025', 'Demo Customer J', 4, 22000),
      dueRow('DEMO-0026', 'Demo Customer K', 5, 20500),
      dueRow('DEMO-0027', 'Demo Customer L', 6, 18000),
      dueRow('DEMO-0028', 'Demo Customer M', 6, 16900),
      dueRow('DEMO-0029', 'Demo Customer N', -2, 15300, 15300),
      dueRow('DEMO-0030', 'Demo Customer O', -8, 9700, 9700),
    ],
    learningCourse: null,
    learningMembersCount: 5,
    learningProgressPct: 45,
    businessFycpBdt: 840000,
  },
  teamSize: 6,
};

const MANAGER: RoleDashboard = {
  own: {
    followups: 2,
    dues: 0,
    duesAmountBdt: 0,
    dueRows: [],
    learningCourse: null,
    learningProgressPct: 0,
    businessFycpBdt: 0,
  },
  team: {
    followups: 47,
    dues: 31,
    duesAmountBdt: 1248000,
    // Preview only: the widget shows these 5 and says "showing 5 of 31".
    dueRows: [
      dueRow('DEMO-0031', 'Demo Customer P', 1, 52000),
      dueRow('DEMO-0032', 'Demo Customer Q', 2, 48500),
      dueRow('DEMO-0033', 'Demo Customer R', 3, 45000),
      dueRow('DEMO-0034', 'Demo Customer S', 4, 41000),
      dueRow('DEMO-0035', 'Demo Customer T', 6, 38000),
      dueRow('DEMO-0036', 'Demo Customer U', -4, 22000, 22000),
      dueRow('DEMO-0037', 'Demo Customer V', -11, 17500, 17500),
    ],
    learningCourse: null,
    learningMembersCount: 23,
    learningProgressPct: 52,
    businessFycpBdt: 4850000,
  },
  teamSize: 38,
};

const ADMIN: RoleDashboard = {
  own: {
    followups: 0,
    dues: 0,
    duesAmountBdt: 0,
    dueRows: [],
    learningCourse: null,
    learningProgressPct: 0,
    businessFycpBdt: 0,
  },
  team: null,
  teamSize: 0,
};

export const DEMO_DASHBOARDS: Record<Role, RoleDashboard> = {
  employee: EMPLOYEE,
  team_lead: TEAM_LEAD,
  manager: MANAGER,
  admin: ADMIN,
};

export function formatBdt(amount: number): string {
  // Whole taka — live sheet values can carry decimals (e.g. lifetime
  // premium), and the Hub displays rounded figures.
  return `৳${Math.round(amount).toLocaleString('en-IN')}`;
}
