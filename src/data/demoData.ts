/**
 * Demo home-screen data, per role — Milestone 1.
 *
 * Clearly fictional, labelled DEMO in the UI, and deliberately different per
 * role so each role view is verifiable:
 * - Employee: own numbers only.
 * - Team Lead: own numbers + a team section.
 * - Manager: downline totals (bigger numbers, team section).
 * - Admin: zero states everywhere (never-empty rule: cards say so plainly).
 * Real data arrives in later milestones (LeadFlow / Due & Lapse sheet /
 * Learning Hub / Sales Command Center).
 */
import type { Role } from '../auth/types';

export interface WidgetData {
  followups: number;
  followupsAmountNote?: string;
  dues: number;
  duesAmountBdt: number;
  learningCourse: string | null;
  /** Team widgets only: how many members are learning (subtitle is localised). */
  learningMembersCount?: number;
  learningProgressPct: number;
  businessFycpBdt: number;
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
    learningCourse: 'The Art of Selling — Communication Masterclass',
    learningProgressPct: 80,
    businessFycpBdt: 240000,
  },
  team: {
    followups: 12,
    dues: 8,
    duesAmountBdt: 196400,
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
    learningCourse: null,
    learningProgressPct: 0,
    businessFycpBdt: 0,
  },
  team: {
    followups: 47,
    dues: 31,
    duesAmountBdt: 1248000,
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
  return `৳${amount.toLocaleString('en-IN')}`;
}
