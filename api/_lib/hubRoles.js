/**
 * Hub role derivation for REAL users (Phase 2 spec §15.5).
 *
 * Pure functions over the Learning Hub employees roster — no I/O, so
 * the QA script unit-tests them directly. The Hub JWT carries `role`
 * (employee / team_lead / manager / admin), derived from the
 * reporting tree — NOT from the LH learning roles (learner /
 * supervisor / trainer), which are learning roles, not Hub roles.
 *
 * Rule (spec §15.5 recommendation, the settled rule for this slice):
 * - admin: the LH `user_roles` marker — 'td_admin' or 'super_admin'
 *   (from the login RPC's profile.roles). Checked FIRST: an admin
 *   keeps org-wide scope regardless of the tree.
 * - manager: the caller's subtree contains at least one team_lead
 *   (a manager of managers — depth >= 2).
 * - team_lead: the caller has >= 1 subordinate (the UM-1 floor).
 * - employee: everyone else.
 *
 * A subordinate counts when the row's supervisor_id is the caller
 * and the row is not inactive (is_active !== false; a null flag
 * counts as active — roster rows default active). Designations are
 * never used (they vary: UM/BM/AGM/DGM/GM/BE/BDM — spec §15.5).
 */

const upper = (v) => String(v ?? '').trim().toUpperCase();

const ADMIN_LH_ROLES = new Set(['td_admin', 'super_admin']);

/** True when the LH role list carries an admin marker. */
export function isLhAdmin(lhRoles) {
  if (!Array.isArray(lhRoles)) return false;
  return lhRoles.some((r) => ADMIN_LH_ROLES.has(String(r || '').trim().toLowerCase()));
}

/**
 * Derive the Hub role for `callerEmployeeId`.
 * `employees`: [{ employee_id, supervisor_id, is_active }] (any
 * extra columns ignored). `lhRoles`: the caller's LH user_roles
 * (from the login RPC profile, e.g. ['learner'] or ['td_admin']).
 */
export function deriveHubRole(employees, callerEmployeeId, lhRoles) {
  if (isLhAdmin(lhRoles)) return 'admin';

  const callerId = upper(callerEmployeeId);
  // supervisor (upper ID) -> [direct reports]. Inactive rows are not
  // anyone's subordinate (LH's team CTE is active-only).
  const children = new Map();
  for (const e of employees || []) {
    if (!e || e.supervisor_id === undefined || e.supervisor_id === null) continue;
    if (e.is_active === false) continue;
    const sup = upper(e.supervisor_id);
    const list = children.get(sup) || [];
    list.push(e);
    children.set(sup, list);
  }

  const direct = children.get(callerId) || [];
  if (direct.length === 0) return 'employee';

  // Manager = the subtree contains a team_lead. Checking the direct
  // reports suffices: any team_lead deeper in the subtree implies
  // its depth-1 ancestor on the path also has a subordinate.
  const hasManagerOfManagers = direct.some(
    (d) => (children.get(upper(d.employee_id)) || []).length > 0,
  );
  return hasManagerOfManagers ? 'manager' : 'team_lead';
}
