/**
 * Learning Hub summary — pure summarizer over fetched rows (Phase 2
 * spec §8). The proxy (api/learning-data.js) fetches the rows via
 * PostgREST and calls this; the demo fixture
 * (api/_lib/demoFixtureLearning.js) builds synthetic rows and calls
 * the SAME function, so scoping is exercised identically for live and
 * demo data.
 *
 * Shape: spec §8.2 exactly, plus `truncated` (additive, mirroring the
 * LeadFlow feed — set when the module_progress fetch hit its cap).
 *
 * Done module = read_done OR quiz_passed (spec §3.4). Per-course % =
 * done / total published modules. Only PUBLISHED courses count.
 *
 * Current course (spec §3.5): the in-progress course with the most
 * recent activity; else the most recently completed course at 100%;
 * else null. A course counts as completed when its progress is 100%
 * (done == total > 0) or its enrolment status is 'completed'.
 *
 * lastActivity comes from module_progress.updated_at ONLY — the
 * credit_ledger is not fetched (deliberate deviation from the spec's
 * "max of progress + ledger" note: the ledger adds a whole-table
 * fetch for a timestamp the progress table already carries).
 *
 * Visibility (Hub rule, spec §6.3): employee → own; team_lead /
 * manager → own + team object; admin → org-wide (the learning fields
 * carry the org totals, team = null — matching the Dashboard and
 * Leads feeds; spec §8.3's "Admin 0" is superseded by Mahadi's
 * standing rule that Admin/T&D sees org-wide). The team object
 * follows hub_my_team's shape (spec §8.1 step 4 / §6.3): teamSize =
 * SUBTREE count, members = DIRECT reports only (cap 50), avgProgress
 * = mean of direct reports' overall % (LH's rule), and
 * learningMembersCount = direct reports with ≥1 in-progress course.
 * A member's overall % = done / total modules across all their
 * published courses with progress. Downline comes from the
 * team_employee_ids RPC primary, BFS over supervisor_id fallback
 * (spec §6.2).
 *
 * Employee IDs compare case-insensitively (LH normalises at login,
 * spec §4). Team-member names + counts (internal staff) are allowed
 * per spec §8.2; no learner PII beyond that.
 */

export const MEMBER_CAP = 50;

const upper = (v) => String(v ?? '').trim().toUpperCase();
const tsMs = (v) => {
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};

function buildEmployeeMaps(employees) {
  const byEmp = new Map();
  for (const e of employees || []) {
    if (!e || e.employee_id === undefined || e.employee_id === null) continue;
    byEmp.set(upper(e.employee_id), e);
  }
  return byEmp;
}

/** Downline employee records for `caller` (spec §6.2). */
export function resolveLearningDownline(employees, caller, rpcIds) {
  const byEmp = buildEmployeeMaps(employees);
  const out = new Map(); // upper Employee ID -> employee
  if (Array.isArray(rpcIds) && rpcIds.length > 0) {
    for (const id of rpcIds) {
      const e = byEmp.get(upper(id));
      if (e) out.set(upper(id), e);
    }
  }
  if (out.size === 0) {
    // Fallback: BFS over supervisor_id (depth cap 100, cycle-guarded).
    const children = new Map(); // supervisor upper ID -> [employee]
    for (const e of employees || []) {
      if (!e || e.supervisor_id === undefined || e.supervisor_id === null) continue;
      const sup = upper(e.supervisor_id);
      const list = children.get(sup) || [];
      list.push(e);
      children.set(sup, list);
    }
    const queue = [{ id: upper(caller.employee_id), depth: 0 }];
    const seen = new Set([upper(caller.employee_id)]);
    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= 100) continue;
      for (const child of children.get(id) || []) {
        const cid = upper(child.employee_id);
        if (seen.has(cid)) continue;
        seen.add(cid);
        out.set(cid, child);
        queue.push({ id: cid, depth: depth + 1 });
      }
    }
  }
  return { downline: [...out.values()], byEmp };
}

/**
 * Per-employee learning state. Returns a Map upper-Employee-ID ->
 * { currentCourse, coursesEnrolled, coursesCompleted, certificates,
 *   creditBalance, overallPercent, modulesCompleted, modulesTotal,
 *   hasInProgress, lastActivity }.
 */
function computeEmployeeStates(input) {
  const { moduleProgress, courseModules, courses, enrollments, certificates, creditBalances } = input;

  const published = new Map(); // course id -> { title, total }
  for (const c of courses || []) {
    if (!c || !c.is_published) continue;
    published.set(String(c.id), { title: String(c.title || ''), total: 0 });
  }
  for (const m of courseModules || []) {
    const course = published.get(String(m?.course_id));
    if (course) course.total += 1;
  }

  // (employee, course) -> { done, lastMs }
  const perCourse = new Map();
  const lastActivity = new Map(); // employee -> max ms
  for (const p of moduleProgress || []) {
    if (!p) continue;
    const course = published.get(String(p.course_id));
    if (!course) continue; // unpublished course progress is ignored
    const emp = upper(p.employee_id);
    const key = `${emp}|${String(p.course_id)}`;
    const entry = perCourse.get(key) || { done: 0, lastMs: null };
    if (p.read_done === true || p.quiz_passed === true) entry.done += 1;
    const ms = tsMs(p.updated_at);
    if (ms !== null) {
      if (entry.lastMs === null || ms > entry.lastMs) entry.lastMs = ms;
      const prev = lastActivity.get(emp);
      if (prev === undefined || ms > prev) lastActivity.set(emp, ms);
    }
    perCourse.set(key, entry);
  }

  // Enrolled (employee, course) pairs — any enrolment row for a
  // published course, plus any pair with progress rows.
  const enrolledPairs = new Set();
  for (const e of enrollments || []) {
    if (!e || !published.has(String(e.course_id))) continue;
    enrolledPairs.add(`${upper(e.employee_id)}|${String(e.course_id)}`);
  }
  for (const key of perCourse.keys()) enrolledPairs.add(key);

  // Completed enrolments (status 'completed') for courses with no
  // progress rows — they still count as completed courses.
  const completedByEnrolment = new Set();
  for (const e of enrollments || []) {
    if (!e || String(e.status || '') !== 'completed') continue;
    const course = published.get(String(e.course_id));
    if (!course || course.total === 0) continue;
    completedByEnrolment.add(`${upper(e.employee_id)}|${String(e.course_id)}`);
  }

  const certCounts = new Map(); // employee -> count
  for (const c of certificates || []) {
    if (!c) continue;
    const emp = upper(c.employee_id);
    certCounts.set(emp, (certCounts.get(emp) || 0) + 1);
  }

  const credits = new Map(); // employee -> balance
  for (const b of creditBalances || []) {
    if (!b) continue;
    const n = Number(b.balance);
    credits.set(upper(b.employee_id), Number.isFinite(n) ? n : 0);
  }

  // Group courses per employee.
  const byEmployee = new Map(); // emp -> [{ courseId, title, done, total, pct, lastMs }]
  for (const [key, entry] of perCourse) {
    const [emp, courseId] = key.split('|');
    const course = published.get(courseId);
    if (!course || course.total === 0) continue;
    const list = byEmployee.get(emp) || [];
    list.push({
      courseId,
      title: course.title,
      done: entry.done,
      total: course.total,
      pct: Math.round((entry.done / course.total) * 100),
      lastMs: entry.lastMs,
    });
    byEmployee.set(emp, list);
  }
  for (const key of completedByEnrolment) {
    const [emp, courseId] = key.split('|');
    const course = published.get(courseId);
    const list = byEmployee.get(emp) || [];
    if (!list.some((c) => c.courseId === courseId)) {
      list.push({ courseId, title: course.title, done: course.total, total: course.total, pct: 100, lastMs: null });
      byEmployee.set(emp, list);
    }
  }

  const states = new Map();
  const allEmps = new Set([
    ...byEmployee.keys(),
    ...certCounts.keys(),
    ...credits.keys(),
    ...[...enrolledPairs].map((k) => k.split('|')[0]),
  ]);
  for (const emp of allEmps) {
    const list = byEmployee.get(emp) || [];
    const inProgress = list.filter((c) => c.pct < 100);
    const completed = list.filter((c) => c.pct >= 100);
    let currentCourse = null;
    if (inProgress.length > 0) {
      const best = inProgress.sort((a, b) => (b.lastMs || 0) - (a.lastMs || 0))[0];
      currentCourse = {
        courseId: best.courseId,
        title: best.title,
        percent: best.pct,
        modulesDone: best.done,
        modulesTotal: best.total,
      };
    } else if (completed.length > 0) {
      const best = completed.sort((a, b) => (b.lastMs || 0) - (a.lastMs || 0))[0];
      currentCourse = {
        courseId: best.courseId,
        title: best.title,
        percent: 100,
        modulesDone: best.done,
        modulesTotal: best.total,
      };
    }
    const modulesCompleted = list.reduce((sum, c) => sum + c.done, 0);
    const modulesTotal = list.reduce((sum, c) => sum + c.total, 0);
    const lastMs = lastActivity.get(emp);
    states.set(emp, {
      currentCourse,
      coursesEnrolled: [...enrolledPairs].filter((k) => k.split('|')[0] === emp).length,
      coursesCompleted: completed.length,
      certificates: certCounts.get(emp) || 0,
      creditBalance: credits.get(emp) || 0,
      overallPercent: modulesTotal > 0 ? Math.round((modulesCompleted / modulesTotal) * 100) : 0,
      modulesCompleted,
      modulesTotal,
      hasInProgress: inProgress.length > 0,
      lastActivity: lastMs !== undefined ? new Date(lastMs).toISOString() : null,
    });
  }
  return states;
}

function emptyLearning() {
  return {
    currentCourse: null,
    coursesEnrolled: 0,
    coursesCompleted: 0,
    certificates: 0,
    creditBalance: 0,
  };
}

function emptyState() {
  return {
    ...emptyLearning(),
    overallPercent: 0,
    modulesCompleted: 0,
    modulesTotal: 0,
    hasInProgress: false,
    lastActivity: null,
  };
}

export function summarizeLearning(input, user) {
  const { employees, downlineIds } = input;
  const byEmp = buildEmployeeMaps(employees);
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
    learning: emptyLearning(),
    team: null,
    truncated: input.truncated === true,
    syncedAt: Date.now(),
  };

  // Missing or inactive employee record → empty, NOT an error (spec
  // §8.1 step 1).
  if (!caller || caller.is_active === false) {
    base.empty = true;
    base.emptyReason = 'no-lms-record';
    return base;
  }

  const states = computeEmployeeStates(input);

  if (role === 'admin') {
    // Admin sees the org-wide aggregates in the learning fields
    // (visibility rule); team = null, as on the Dashboard and Leads
    // feeds.
    let coursesEnrolled = 0;
    let coursesCompleted = 0;
    let certificates = 0;
    let creditBalance = 0;
    for (const s of states.values()) {
      coursesEnrolled += s.coursesEnrolled;
      coursesCompleted += s.coursesCompleted;
      certificates += s.certificates;
      creditBalance += s.creditBalance;
    }
    base.learning = { currentCourse: null, coursesEnrolled, coursesCompleted, certificates, creditBalance };
    base.empty = states.size === 0;
    if (base.empty) base.emptyReason = 'no-rows';
    return base;
  }

  const ownState = states.get(upper(caller.employee_id)) || emptyState();
  base.learning = {
    currentCourse: ownState.currentCourse,
    coursesEnrolled: ownState.coursesEnrolled,
    coursesCompleted: ownState.coursesCompleted,
    certificates: ownState.certificates,
    creditBalance: ownState.creditBalance,
  };

  if (role === 'team_lead' || role === 'manager') {
    const { downline } = resolveLearningDownline(employees, caller, downlineIds);
    const callerId = upper(caller.employee_id);
    const direct = (employees || []).filter((e) => upper(e?.supervisor_id) === callerId);
    const members = direct
      .map((m) => {
        const s = states.get(upper(m.employee_id)) || emptyState();
        return {
          employeeId: String(m.employee_id),
          name: String(m.full_name || ''),
          designation: String(m.designation || ''),
          overallPercent: s.overallPercent,
          modulesCompleted: s.modulesCompleted,
          modulesTotal: s.modulesTotal,
          credit: s.creditBalance,
          lastActivity: s.lastActivity,
          _hasInProgress: s.hasInProgress,
        };
      })
      .sort((a, b) => b.overallPercent - a.overallPercent || a.name.localeCompare(b.name));
    const learningMembersCount = members.filter((m) => m._hasInProgress).length;
    const avgProgress = members.length > 0
      ? Math.round(members.reduce((sum, m) => sum + m.overallPercent, 0) / members.length)
      : 0;
    base.team = {
      teamSize: downline.length,
      directCount: direct.length,
      avgProgress,
      learningMembersCount,
      members: members.slice(0, MEMBER_CAP).map(({ _hasInProgress, ...rest }) => rest),
    };
  }

  const ownEmpty = !base.learning.currentCourse
    && base.learning.coursesEnrolled === 0
    && base.learning.coursesCompleted === 0
    && base.learning.certificates === 0
    && base.learning.creditBalance === 0;
  const teamEmpty = !base.team || (base.team.learningMembersCount === 0 && base.team.members.every((m) => m.modulesCompleted === 0 && m.credit === 0));
  if (ownEmpty && teamEmpty) {
    base.empty = true;
    base.emptyReason = 'no-rows';
  }
  return base;
}
