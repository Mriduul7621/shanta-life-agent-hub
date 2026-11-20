/**
 * Synthetic demo Learning Hub slice for the fictional 999xxxx demo
 * users.
 *
 * Same pattern as the retail fixture (api/_lib/demoFixture.js): the
 * demo accounts match no real Learning Hub rows, so pure scoping
 * would show them an empty Learning page. The proxy serves this small
 * synthetic slice — clearly labelled DEMO in the UI — so each role's
 * scoped view is reviewable on the preview without ever exposing real
 * learner data to the public demo login. NO real rows are used.
 *
 * GATING: the proxy serves this ONLY when HUB_DEMO_FIXTURE=true AND
 * the caller's sub starts with '999' (NO Vercel-env check — see
 * api/retail-data.js: this project's deployments run on the production
 * target, so a VERCEL_ENV gate would silently disable the fixture).
 *
 * The slice goes through the SAME summarizer as live data
 * (api/_lib/learningSummary.js), so scoping is exercised identically.
 * All dates are relative to `todayIso` (Dhaka day) so the fixture
 * never goes stale. Counts mirror demoData.ts per role (spec §8.3),
 * with one deliberate divergence: demoData shows Admin as all-zeros,
 * but the Hub visibility rule (Mahadi) says Admin/T&D sees ORG-WIDE
 * — so the admin fixture summary is the org-wide aggregate, matching
 * the Dashboard and Leads feeds.
 *
 * Tree (same spine as the retail/LeadFlow fixtures, plus extras):
 * 9990003 (Manager) -> 9990002 (Team Lead) -> 9990001, 9990011,
 * 9990012, 9990014, 9990015; 9990003 -> 9990005 -> 9990013; 9990003
 * also supervises 21 generated FAs (9990020–9990040). 9990004
 * (Admin) holds an employees row with no enrolments and sees the org.
 *
 * Course A "The Art of Selling — Communication Masterclass": 20
 * modules, published (20 modules so 45% is representable). Course B
 * "Shanta Life Product Essentials": 5 modules, published — completed
 * ONLY by 9990004 (Admin), the one caller whose own enrolment never
 * appears in a team average (admin own = org totals). 9990003
 * (Manager) has NO own learning at all — matching demoData, where
 * the manager's own learning is 0. Course C "Draft Course": 3
 * modules, UNPUBLISHED — 9990001 has progress in it and it must NOT
 * count (published-only filter).
 *
 * Course A progress (done/20): 9990001: 12 (60%) · 9990011: 10 (50%)
 * · 9990012: 9 (45%) · 9990014: 8 (40%) · 9990015: 6 (30%) ·
 * 9990002: 16 (80%) · 9990005: 12 (60%) · 9990013: 14 (70%) ·
 * 9990003: none · 9990004: none · generated 9990020–9990039:
 * [14,12,10,8,6] repeating (70/60/50/40/30%) · 9990040: 11 (55%).
 * Team-lead team: avg 45% (60+50+45+40+30)/5, 5 learning members,
 * teamSize 5, directCount 5. Manager team: avg 52% (sum 1195 over
 * 23), 23 learning members, teamSize 29, directCount 23.
 * Credits: 9990001: 85 · 9990002: 120 · 9990003: 200 · 9990005: 60 ·
 * 9990011: 40 · 9990012: 30 · 9990013: 10 · 9990014: 25 · 9990015: 15
 * · generated: 5 each · 9990004: 0. Org total: 690. Org enrolment
 * pairs: 30. Org completions: 1. Org certificates: 1.
 * Hand-computed expectations are asserted exactly in
 * scripts/qa-learning-live.mjs.
 */

function addDaysIso(value, days) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 09:00 Dhaka = 03:00 UTC.
const at09Dhaka = (iso) => `${iso}T03:00:00Z`;

export const COURSE_A_ID = '00000000-0000-0000-0000-0000000000a1';
export const COURSE_B_ID = '00000000-0000-0000-0000-0000000000b2';
export const COURSE_C_ID = '00000000-0000-0000-0000-0000000000c3';

function employee(employeeId, fullName, designation, supervisorId) {
  return {
    employee_id: employeeId,
    full_name: fullName,
    designation,
    supervisor_id: supervisorId,
    is_active: true,
  };
}

export function buildLearningFixture(todayIso) {
  const today = todayIso;
  const fiveDaysAgo = addDaysIso(today, -5);

  const employees = [
    employee('9990003', 'Demo Manager', 'General Manager', null),
    employee('9990002', 'Demo Team Lead', 'Unit Manager', '9990003'),
    employee('9990005', 'Demo UM Five', 'Unit Manager', '9990003'),
    employee('9990001', 'Demo Agent', 'Field Associate', '9990002'),
    employee('9990011', 'Demo FA Eleven', 'Field Associate', '9990002'),
    employee('9990012', 'Demo FA Twelve', 'Field Associate', '9990002'),
    employee('9990014', 'Demo FA Fourteen', 'Field Associate', '9990002'),
    employee('9990015', 'Demo FA Fifteen', 'Field Associate', '9990002'),
    employee('9990013', 'Demo FA Thirteen', 'Field Associate', '9990005'),
    employee('9990004', 'Demo Admin', 'Admin', null),
  ];
  for (let i = 20; i <= 40; i++) {
    employees.push(employee(`99900${i}`, `Demo FA ${i}`, 'Field Associate', '9990003'));
  }

  const courses = [
    { id: COURSE_A_ID, title: 'The Art of Selling — Communication Masterclass', title_bn: null, is_published: true },
    { id: COURSE_B_ID, title: 'Shanta Life Product Essentials', title_bn: null, is_published: true },
    { id: COURSE_C_ID, title: 'Draft Course', title_bn: null, is_published: false },
  ];

  const courseModules = [];
  const addModules = (courseId, count, prefix) => {
    for (let i = 1; i <= count; i++) {
      courseModules.push({ course_id: courseId, module_key: `${prefix}-${i}`, title: `Module ${i}`, sort_order: i });
    }
  };
  addModules(COURSE_A_ID, 20, 'aos');
  addModules(COURSE_B_ID, 5, 'spe');
  addModules(COURSE_C_ID, 3, 'draft');

  // Course A progress: employee -> done modules (of 20).
  const progressA = {
    '9990001': 12,
    '9990011': 10,
    '9990012': 9,
    '9990014': 8,
    '9990015': 6,
    '9990002': 16,
    '9990005': 12,
    '9990013': 14,
    // 9990003 (Manager) has no own learning — matches demoData.
  };
  const pattern = [14, 12, 10, 8, 6];
  for (let i = 20; i <= 39; i++) progressA[`99900${i}`] = pattern[(i - 20) % 5];
  progressA['9990040'] = 11;

  const moduleProgress = [];
  const enrollments = [];
  const addProgress = (empId, courseId, prefix, done, total, updatedAt) => {
    for (let i = 1; i <= total; i++) {
      moduleProgress.push({
        employee_id: empId,
        course_id: courseId,
        module_key: `${prefix}-${i}`,
        read_done: i <= done,
        quiz_passed: false,
        best_score: null,
        attempts: i <= done ? 1 : 0,
        updated_at: updatedAt,
      });
    }
  };
  for (const [empId, done] of Object.entries(progressA)) {
    addProgress(empId, COURSE_A_ID, 'aos', done, 20, at09Dhaka(today));
    enrollments.push({ employee_id: empId, course_id: COURSE_A_ID, status: 'enrolled', completed_at: null });
  }
  // 9990004 (Admin) completed course B (the only completion in the
  // fixture — it shows only in the org-wide admin totals).
  addProgress('9990004', COURSE_B_ID, 'spe', 5, 5, at09Dhaka(fiveDaysAgo));
  enrollments.push({ employee_id: '9990004', course_id: COURSE_B_ID, status: 'completed', completed_at: at09Dhaka(fiveDaysAgo) });
  // 9990001 has progress in the UNPUBLISHED course C — must not count.
  addProgress('9990001', COURSE_C_ID, 'draft', 3, 3, at09Dhaka(today));

  const certificates = [
    { employee_id: '9990004', course_id: COURSE_B_ID, certificate_no: 'DEMO-0001', final_score: 92, issued_at: at09Dhaka(fiveDaysAgo) },
  ];

  const creditBalances = [
    { employee_id: '9990001', balance: 85 },
    { employee_id: '9990002', balance: 120 },
    { employee_id: '9990003', balance: 200 },
    { employee_id: '9990005', balance: 60 },
    { employee_id: '9990011', balance: 40 },
    { employee_id: '9990012', balance: 30 },
    { employee_id: '9990013', balance: 10 },
    { employee_id: '9990014', balance: 25 },
    { employee_id: '9990015', balance: 15 },
    { employee_id: '9990004', balance: 0 },
  ];
  for (let i = 20; i <= 40; i++) creditBalances.push({ employee_id: `99900${i}`, balance: 5 });

  return {
    employees,
    moduleProgress,
    courseModules,
    courses,
    enrollments,
    certificates,
    creditBalances,
  };
}
