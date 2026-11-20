/**
 * Synthetic demo LeadFlow slice for the fictional 999xxxx demo users.
 *
 * Same pattern as the retail fixture (api/_lib/demoFixture.js): the
 * demo accounts match no real LeadFlow rows, so pure scoping would show
 * them an empty Leads page. The proxy serves this small synthetic slice
 * — clearly labelled DEMO in the UI — so each role's scoped view is
 * reviewable on the preview without ever exposing real lead data to the
 * public demo login. NO real rows are used, and NO customer PII exists
 * here at all: fixture leads carry no customer_name / mobile (the
 * summarizer never selects them — counts and aggregates only).
 *
 * GATING: the proxy serves this ONLY when HUB_DEMO_FIXTURE=true AND the
 * caller's sub starts with '999' (NO Vercel-env check — see
 * api/retail-data.js: this project's deployments run on the production
 * target, so a VERCEL_ENV gate would silently disable the fixture).
 *
 * The slice goes through the SAME summarizer as live data
 * (api/_lib/leadflowSummary.js), so scoping is exercised identically.
 * All dates are relative to `todayIso` (Dhaka day) so the fixture never
 * goes stale. Counts mirror demoData.ts per role (spec §7.5), with one
 * deliberate divergence: demoData shows Admin as all-zeros, but the Hub
 * visibility rule (Mahadi) says Admin/T&D sees ORG-WIDE — so the admin
 * fixture summary is the org-wide aggregate, matching the Dashboard.
 *
 * Tree (same as the retail fixture): 9990003 (Manager) -> 9990002
 * (Team Lead) -> 9990001, 9990011, 9990012 (FAs); 9990003 -> 9990005
 * (UM) -> 9990013 (FA). 9990004 (Admin) holds a users row with no
 * leads of its own and sees the org.
 *
 * Follow-ups due TODAY per user: 9990001: 3 · 9990011: 5 · 9990012: 4 ·
 * 9990002: 4 · 9990005: 8 · 9990013: 23 · 9990003: 2 · 9990004: 0.
 * Team today: 9990002 -> 12 (3+5+4) · 9990003 -> 47 (4+8+3+5+4+23).
 * Org today: 49. Overdue: 13 org (team 9990002: 3, team 9990003: 12).
 * Upcoming: 16 org. Converted: 4. Not Interested: 1. Total leads: 83.
 * todayCollection: 4 org. Hand-computed expectations are asserted
 * exactly in scripts/qa-leadflow-live.mjs.
 */

function addDaysIso(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 10:00 Dhaka = 04:00 UTC. Bucket boundaries are Dhaka-day instants,
// so these land squarely inside their buckets whatever the run time.
const at10Dhaka = (iso) => `${iso}T04:00:00Z`;
const at08Dhaka = (iso) => `${iso}T02:00:00Z`;

const UUID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function user(employeeId, fullName, managerId, subordinates) {
  return {
    id: UUID(employeeId),
    employee_id: employeeId,
    full_name: fullName,
    subordinates,
    manager_id: managerId,
  };
}

export function buildLeadflowFixture(todayIso) {
  const today = todayIso;
  const yesterday = addDaysIso(today, -1);
  const tomorrow = addDaysIso(today, 1);
  const fiveDaysAgo = addDaysIso(today, -5);

  const users = [
    user('9990003', 'Demo Manager', null, ['9990002', '9990005', '9990001', '9990011', '9990012', '9990013']),
    user('9990002', 'Demo Team Lead', UUID('9990003'), ['9990001', '9990011', '9990012']),
    user('9990005', 'Demo UM Five', UUID('9990003'), ['9990013']),
    user('9990001', 'Demo Agent', UUID('9990002'), []),
    user('9990011', 'Demo FA Eleven', UUID('9990002'), []),
    user('9990012', 'Demo FA Twelve', UUID('9990002'), []),
    user('9990013', 'Demo FA Thirteen', UUID('9990005'), []),
    user('9990004', 'Demo Admin', null, []),
  ];

  const leads = [];
  let n = 0;
  // Per user: { today, overdue, upcoming, converted, notInterested, createdToday }
  const plan = {
    '9990001': { today: 3, overdue: 1, upcoming: 2, converted: 1, notInterested: 0, createdToday: 1 },
    '9990011': { today: 5, overdue: 2, upcoming: 1, converted: 2, notInterested: 0, createdToday: 0 },
    '9990012': { today: 4, overdue: 0, upcoming: 2, converted: 0, notInterested: 1, createdToday: 0 },
    '9990002': { today: 4, overdue: 1, upcoming: 3, converted: 1, notInterested: 0, createdToday: 2 },
    '9990005': { today: 8, overdue: 3, upcoming: 2, converted: 0, notInterested: 0, createdToday: 0 },
    '9990013': { today: 23, overdue: 5, upcoming: 4, converted: 0, notInterested: 0, createdToday: 1 },
    '9990003': { today: 2, overdue: 1, upcoming: 2, converted: 0, notInterested: 0, createdToday: 0 },
    '9990004': { today: 0, overdue: 0, upcoming: 0, converted: 0, notInterested: 0, createdToday: 0 },
  };
  const addLead = (empId, status, nextFollowUpAt, createdAt) => {
    n += 1;
    leads.push({
      id: `00000000-0000-0000-0001-${String(n).padStart(12, '0')}`,
      current_status: status,
      next_follow_up_at: nextFollowUpAt,
      assigned_to: UUID(empId),
      custom_fields: {},
      created_at: createdAt,
      is_deleted: false,
    });
  };
  for (const [empId, p] of Object.entries(plan)) {
    // Statuses are fixed per bucket so statusCounts are hand-computable:
    // today -> 'Follow-up Set', overdue -> 'Contacted', upcoming ->
    // 'Interested'. Terminal leads carry no next_follow_up_at.
    let createdTodayLeft = p.createdToday;
    const createdAtFor = () => {
      if (createdTodayLeft > 0) {
        createdTodayLeft -= 1;
        return at08Dhaka(today);
      }
      return at08Dhaka(fiveDaysAgo);
    };
    for (let i = 0; i < p.today; i++) addLead(empId, 'Follow-up Set', at10Dhaka(today), createdAtFor());
    for (let i = 0; i < p.overdue; i++) addLead(empId, 'Contacted', at10Dhaka(yesterday), createdAtFor());
    for (let i = 0; i < p.upcoming; i++) addLead(empId, 'Interested', at10Dhaka(tomorrow), createdAtFor());
    for (let i = 0; i < p.converted; i++) addLead(empId, 'Converted', null, createdAtFor());
    for (let i = 0; i < p.notInterested; i++) addLead(empId, 'Not Interested', null, createdAtFor());
  }

  return {
    users,
    leads,
    terminalStatuses: new Set(['Converted', 'Not Interested']),
  };
}
