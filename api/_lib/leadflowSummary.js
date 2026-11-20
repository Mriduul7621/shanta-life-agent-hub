/**
 * LeadFlow summary — pure summarizer over fetched rows (Phase 2 spec
 * §7). The proxy (api/leadflow-data.js) fetches the rows via PostgREST
 * and calls this; the demo fixture (api/_lib/demoFixtureLeadflow.js)
 * builds synthetic rows and calls the SAME function, so scoping is
 * exercised identically for live and demo data.
 *
 * Inputs:
 *   users: [{ id, employee_id, full_name, subordinates, manager_id }]
 *     — the LeadFlow users map (password NEVER selected, spec §5).
 *   ownCounts / teamCounts: exact headline counts from PostgREST
 *     count queries (or computed from rows by the fixture path):
 *     { followups: { overdue, today, upcoming }, total, open,
 *       converted, todayCollection }.
 *   rows: fetched leads for the visible set (bounded — see
 *     LEADFLOW_FETCH_CAP), used ONLY for statusCounts + the member
 *     breakdown: [{ id, current_status, next_follow_up_at,
 *     assigned_to, custom_fields, created_at }]. Customer PII is
 *     never selected (no customer_name, no mobile — counts and
 *     aggregates only, spec §15.10 default).
 *   terminalStatuses: Set of terminal status names (from the
 *     Metadata Engine options table; defaults Converted + Not
 *     Interested).
 *
 * Output: LeadFlowSummary (spec §7.2, WITHOUT todayItems — the Hub
 * shows counts only in this slice; the agent opens LeadFlow itself
 * for the full follow-up list).
 *
 * Visibility (Hub rule, spec §6.3): employee → own; team_lead /
 * manager → own + downline (team object = downline only);
 * admin → org-wide (own fields carry the org totals, team = null).
 * Downline: `users.subordinates` primary (maintained by LeadFlow's
 * recomputeReportingChains), BFS over manager_id when it is missing
 * or empty (spec §6.1). Assignee resolution: `assigned_to` UUID,
 * falling back to `custom_fields.assignedTo` (Employee ID).
 * Employee IDs compare case-insensitively (LeadFlow upper-cases at
 * login, spec §4).
 */

import { dhakaDayBounds, parseTsMs } from './supabase.js';

export const LEADFLOW_FETCH_CAP = 2000;
export const DEFAULT_TERMINAL = new Set(['Converted', 'Not Interested']);
export const MEMBER_CAP = 50;

const upper = (v) => String(v ?? '').trim().toUpperCase();
const isTerminal = (status, terminal) => terminal.has(String(status ?? '').trim());

function emptyBuckets() {
  return { overdue: 0, today: 0, upcoming: 0, all: 0 };
}

function emptyCounts() {
  return {
    followups: emptyBuckets(),
    total: 0,
    open: 0,
    converted: 0,
    todayCollection: 0,
  };
}

function withAll(buckets) {
  return { ...buckets, all: buckets.overdue + buckets.today + buckets.upcoming };
}

/**
 * Aggregate headline counts from fetched rows (the fixture path, and
 * the proxy's fallback when count queries are unavailable). `scopeIds`
 * is the set of user UUIDs (upper-cased Employee IDs in the fallback
 * arm) whose leads count. Returns the same shape the count queries
 * produce.
 */
export function aggregateLeadCounts(rows, usersByUuid, usersByEmp, scopeUuids, scopeEmpIds, terminal, todayIso) {
  const { startMs, endMs } = dhakaDayBounds(todayIso);
  const counts = emptyCounts();
  const seen = new Set();
  for (const row of rows) {
    if (!row || row.is_deleted) continue;
    const id = String(row.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // Attribute the lead: assigned_to UUID first, custom_fields
    // fallback second. Unattributable rows are dropped (they matched
    // a fetch arm but resolve to nobody in the users map).
    let assigneeUuid = row.assigned_to ? String(row.assigned_to) : '';
    let assigneeEmp = '';
    if (assigneeUuid && usersByUuid.has(assigneeUuid)) {
      assigneeEmp = upper(usersByUuid.get(assigneeUuid).employee_id);
    } else {
      const fallback = row.custom_fields && typeof row.custom_fields === 'object'
        ? row.custom_fields.assignedTo
        : null;
      assigneeEmp = upper(fallback);
      const byEmp = assigneeEmp ? usersByEmp.get(assigneeEmp) : null;
      assigneeUuid = byEmp ? String(byEmp.id) : '';
    }
    if (!assigneeUuid || !scopeUuids.has(assigneeUuid)) {
      if (!assigneeEmp || !scopeEmpIds.has(assigneeEmp)) continue;
    }
    counts.total += 1;
    const isTerm = isTerminal(row.current_status, terminal);
    if (isTerm) {
      if (String(row.current_status).trim() === 'Converted') counts.converted += 1;
      // Terminal leads never sit in a follow-up bucket (spec §2.5).
    } else {
      counts.open += 1;
      const ms = parseTsMs(row.next_follow_up_at);
      if (ms !== null) {
        if (ms < startMs) counts.followups.overdue += 1;
        else if (ms < endMs) counts.followups.today += 1;
        else counts.followups.upcoming += 1;
      }
    }
    const createdMs = parseTsMs(row.created_at);
    if (createdMs !== null && createdMs >= startMs && createdMs < endMs) {
      counts.todayCollection += 1;
    }
  }
  counts.followups = withAll(counts.followups);
  return counts;
}

function buildUserMaps(users) {
  const byUuid = new Map();
  const byEmp = new Map();
  for (const u of users || []) {
    if (!u || !u.id) continue;
    byUuid.set(String(u.id), u);
    const emp = upper(u.employee_id);
    if (emp) byEmp.set(emp, u);
  }
  return { byUuid, byEmp };
}

/** Downline user records for `caller` (spec §6.1). */
export function resolveDownline(users, caller) {
  const { byUuid, byEmp } = buildUserMaps(users);
  const out = new Map(); // uuid -> user
  const subs = Array.isArray(caller?.subordinates) ? caller.subordinates : [];
  if (subs.length > 0) {
    for (const emp of subs) {
      const u = byEmp.get(upper(emp));
      if (u) out.set(String(u.id), u);
    }
  }
  if (out.size === 0) {
    // Fallback: BFS over manager_id (depth cap 100, cycle-guarded).
    const children = new Map(); // manager uuid -> [user]
    for (const u of users || []) {
      if (!u || !u.manager_id) continue;
      const list = children.get(String(u.manager_id)) || [];
      list.push(u);
      children.set(String(u.manager_id), list);
    }
    const queue = [{ id: String(caller.id), depth: 0 }];
    const seen = new Set([String(caller.id)]);
    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= 100) continue;
      for (const child of children.get(id) || []) {
        const cid = String(child.id);
        if (seen.has(cid)) continue;
        seen.add(cid);
        out.set(cid, child);
        queue.push({ id: cid, depth: depth + 1 });
      }
    }
  }
  return { downline: [...out.values()], byUuid, byEmp };
}

/**
 * The user-ID sets a caller may see, for the proxy's PostgREST filters
 * and the fixture's count aggregation. Admin returns null sets (no
 * user filter — org-wide). Returns null when the caller has no
 * LeadFlow row.
 */
export function scopeSetsFor(users, employeeId, role) {
  const { byUuid, byEmp } = buildUserMaps(users);
  const caller = byEmp.get(upper(employeeId)) || null;
  const toPair = (u) => ({ uuid: String(u.id), emp: upper(u.employee_id) });
  if (role === 'admin') {
    // Admin aggregates org-wide EVEN WITHOUT a LeadFlow row (Mahadi's
    // standing rule: Admin/T&D sees org-wide; T&D staff have no
    // LeadFlow account — live finding 2026-11-20: 2025019 has none).
    // The proxy still sends no user filter for admin — the sets are
    // for aggregation only.
    const all = [...byUuid.values()].map(toPair);
    return {
      caller,
      downline: [],
      ownUuids: new Set(all.map((p) => p.uuid)),
      ownEmpIds: new Set(all.map((p) => p.emp)),
      teamUuids: new Set(),
      teamEmpIds: new Set(),
      ownPairs: all,
      teamPairs: [],
    };
  }
  if (!caller) return null;
  const { downline } = resolveDownline(users, caller);
  return {
    caller,
    downline,
    ownUuids: new Set([String(caller.id)]),
    ownEmpIds: new Set([upper(caller.employee_id)]),
    teamUuids: new Set(downline.map((u) => String(u.id))),
    teamEmpIds: new Set(downline.map((u) => upper(u.employee_id))),
    ownPairs: [toPair(caller)],
    teamPairs: downline.map(toPair),
  };
}

function statusCountsFor(rows, usersByUuid, usersByEmp, scopeUuids, scopeEmpIds) {
  const counts = {};
  const seen = new Set();
  for (const row of rows) {
    if (!row || row.is_deleted) continue;
    const id = String(row.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let uuid = row.assigned_to ? String(row.assigned_to) : '';
    let emp = '';
    if (uuid && usersByUuid.has(uuid)) emp = upper(usersByUuid.get(uuid).employee_id);
    else {
      const fb = row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields.assignedTo : null;
      emp = upper(fb);
      const byEmp = emp ? usersByEmp.get(emp) : null;
      uuid = byEmp ? String(byEmp.id) : '';
    }
    const inScope = (uuid && scopeUuids.has(uuid)) || (emp && scopeEmpIds.has(emp));
    if (!inScope) continue;
    const status = String(row.current_status ?? '').trim() || '(none)';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

export function summarizeLeadflow(input, user, todayIso) {
  const { users, ownCounts, teamCounts, rows, terminalStatuses, truncated } = input;
  const terminal = terminalStatuses instanceof Set ? terminalStatuses : DEFAULT_TERMINAL;
  const { byUuid, byEmp } = buildUserMaps(users);
  const caller = byEmp.get(upper(user.employeeId)) || null;
  const role = user.role;
  const scope = role === 'admin' ? 'org' : role === 'manager' ? 'subtree' : role === 'team_lead' ? 'team' : 'own';

  const base = {
    demo: false,
    scope,
    role,
    userEmployeeId: user.employeeId,
    userName: caller ? String(caller.full_name || '') : null,
    empty: false,
    emptyReason: null,
    followups: emptyBuckets(),
    leads: { total: 0, open: 0, converted: 0, todayCollection: 0, statusCounts: {} },
    team: null,
    terminalFallback: input.terminalFallback === true,
    truncated: truncated === true,
    syncedAt: Date.now(),
  };

  if (!caller && role !== 'admin') {
    base.empty = true;
    base.emptyReason = 'no-leadflow-account';
    return base;
  }

  const downline = caller ? resolveDownline(users, caller).downline : [];
  // Admin without a LeadFlow row has no own sets (the admin branch
  // below uses the org-wide sets instead, so these stay empty).
  const ownUuids = caller ? new Set([String(caller.id)]) : new Set();
  const ownEmpIds = caller ? new Set([upper(caller.employee_id)]) : new Set();

  // Admin: the proxy passes the org-wide counts as ownCounts, so the
  // own fields carry the org totals (visibility rule); team_lead /
  // manager: own + downline team object; employee: own.
  const own = ownCounts;
  base.followups = withAll({ ...own.followups });
  base.leads = {
    total: own.total,
    open: own.open,
    converted: own.converted,
    todayCollection: own.todayCollection,
    statusCounts: statusCountsFor(
      rows,
      byUuid,
      byEmp,
      role === 'admin' ? new Set([...byUuid.keys()]) : ownUuids,
      role === 'admin' ? new Set([...byEmp.keys()]) : ownEmpIds,
    ),
  };

  if (role === 'team_lead' || role === 'manager') {
    // Direct reports first (member-wise breakdown), whole subtree in
    // the team totals (spec §6.3).
    const direct = downline.filter((u) => String(u.manager_id || '') === String(caller.id));
    const members = direct
      .map((m) => {
        const mCounts = aggregateLeadCounts(
          rows,
          byUuid,
          byEmp,
          new Set([String(m.id)]),
          new Set([upper(m.employee_id)]),
          terminal,
          todayIso,
        );
        return {
          employeeId: String(m.employee_id),
          name: String(m.full_name || ''),
          followupsToday: mCounts.followups.today,
          followupsOverdue: mCounts.followups.overdue,
          openLeads: mCounts.open,
        };
      })
      .sort((a, b) => b.followupsToday - a.followupsToday || a.name.localeCompare(b.name))
      .slice(0, MEMBER_CAP);
    base.team = {
      teamSize: downline.length,
      followups: withAll({ ...teamCounts.followups }),
      leads: { total: teamCounts.total, open: teamCounts.open, converted: teamCounts.converted },
      members,
    };
  }

  const ownTotal = base.leads.total;
  const teamTotal = base.team ? base.team.leads.total : 0;
  if (ownTotal === 0 && teamTotal === 0) {
    base.empty = true;
    base.emptyReason = 'no-rows';
  }
  return base;
}
