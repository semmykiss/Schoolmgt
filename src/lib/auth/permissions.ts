// Role-based access control — pure logic (no db imports).
//
// The permission catalogue is granular (module.entity.action) so schools can
// delegate narrowly — e.g. a cashier gets `fees.payments.write` without the
// ability to restructure fees. Wildcards still work when matching:
//   '*'        → everything
//   'fees.*'   → anything starting 'fees.'
//   '*.read'   → anything ending '.read'

export interface PermissionEntry {
  key: string
  module: string // catalogue group
  label: string
  description: string
}

const entry = (module: string, key: string, label: string, description: string): PermissionEntry => ({
  module, key, label, description,
})

/** The full catalogue — single source of truth for API routes, the roles
 *  matrix UI and the permission patch validator. */
export const PERMISSION_CATALOG: PermissionEntry[] = [
  // ── Students ──────────────────────────────────────────────────────────────
  entry('students', 'students.read', 'View students', 'Student lists, profiles and guardians'),
  entry('students', 'students.write', 'Manage students', 'Enrol, edit and link guardians'),
  entry('students', 'students.import', 'Import students', 'Bulk CSV import'),
  entry('students', 'students.export', 'Export students', 'CSV export and ID cards'),
  entry('students', 'students.exit', 'Graduate / withdraw', 'Exit students from the school'),
  // ── Admissions ────────────────────────────────────────────────────────────
  entry('admissions', 'admissions.read', 'View applicants', 'Applicant pipeline and details'),
  entry('admissions', 'admissions.write', 'Manage applicants', 'Create, edit and move pipeline stages'),
  entry('admissions', 'admissions.convert', 'Admit applicants', 'Convert applicants to students'),
  // ── Academics ─────────────────────────────────────────────────────────────
  entry('academic', 'academic.read', 'View academic setup', 'Sessions, terms, classes, subjects, lesson plans'),
  entry('academic', 'academic.sessions.write', 'Manage sessions & terms', 'Create terms and activate the current one'),
  entry('academic', 'academic.classes.write', 'Manage classes & sections', 'Classes, sections and form teachers'),
  entry('academic', 'academic.subjects.write', 'Manage subjects', 'Subjects and class-subject assignments'),
  entry('academic', 'academic.promotions.write', 'Run promotions', 'Promote students between classes'),
  entry('academic', 'academic.lessonplans.write', 'Manage lesson plans', 'Create and review lesson plans'),
  // ── Timetable ─────────────────────────────────────────────────────────────
  entry('timetable', 'timetable.read', 'View timetables', 'Class and teacher grids'),
  entry('timetable', 'timetable.write', 'Manage timetable', 'Periods, slots and term copying'),
  // ── Attendance ────────────────────────────────────────────────────────────
  entry('attendance', 'attendance.read', 'View attendance', 'Registers and monthly summaries'),
  entry('attendance', 'attendance.write', 'Mark attendance', 'Record the daily / per-period student register'),
  entry('attendance', 'attendance.staff.write', 'Mark staff attendance', 'Record the staff attendance register'),
  // ── Exams & grades ────────────────────────────────────────────────────────
  entry('exams', 'exams.read', 'View exams & results', 'Exams, brodsheets and report cards'),
  entry('exams', 'exams.setup', 'Exam setup', 'Exam types and grading scales'),
  entry('exams', 'exams.write', 'Manage exams', 'Create exams and schedules'),
  entry('exams', 'exams.marks', 'Enter marks', 'Marks entry with auto-grading'),
  entry('exams', 'exams.publish', 'Publish results', 'Release results to portals'),
  entry('exams', 'exams.reportcards.write', 'Generate report cards', 'Generate and regenerate report cards'),
  // ── Homework ──────────────────────────────────────────────────────────────
  entry('assignments', 'assignments.read', 'View homework', 'Assignments and submissions'),
  entry('assignments', 'assignments.write', 'Manage homework', 'Post and edit assignments'),
  entry('assignments', 'assignments.grade', 'Grade submissions', 'Score and return submitted work'),
  // ── Fees & billing ────────────────────────────────────────────────────────
  entry('fees', 'fees.read', 'View fees', 'Invoices, payments and fee summaries'),
  entry('fees', 'fees.structures.write', 'Manage fee structures', 'Fee heads per class and term'),
  entry('fees', 'fees.invoices.write', 'Manage invoices', 'Raise, bulk-bill and void invoices'),
  entry('fees', 'fees.payments.write', 'Record payments', 'Record and reverse fee payments'),
  entry('fees', 'fees.discounts.write', 'Manage discounts', 'Scholarships and sibling discounts'),
  // ── Accounts ──────────────────────────────────────────────────────────────
  entry('accounts', 'accounts.read', 'View ledger', 'Income / expense ledger and summaries'),
  entry('accounts', 'accounts.write', 'Manage ledger', 'Post and edit ledger entries'),
  // ── HR & payroll ──────────────────────────────────────────────────────────
  entry('hr', 'hr.read', 'View staff records', 'Employees, salaries, payroll and leave register'),
  entry('hr', 'hr.employees.write', 'Manage employees', 'Create and edit staff records'),
  entry('hr', 'hr.employees.portal', 'Provision staff logins', 'Create / reset staff portal access'),
  entry('hr', 'hr.salaries.write', 'Manage salary structures', 'Basic, allowances and deduction setups'),
  entry('hr', 'hr.payroll.write', 'Run payroll', 'Generate monthly payslip runs'),
  entry('hr', 'hr.payroll.settle', 'Settle payslips', 'Mark payslips paid and post to the ledger'),
  entry('hr', 'hr.leave.write', 'Approve leave', 'Approve / reject requests and file on behalf of staff'),
  // ── Inventory & library (Phase 9) ─────────────────────────────────────────
  entry('inventory', 'inventory.read', 'View inventory', 'Stock items and movements'),
  entry('inventory', 'inventory.write', 'Manage inventory', 'Items, suppliers and stock movements'),
  entry('library', 'library.read', 'View library', 'Catalogue and issuing records'),
  entry('library', 'library.write', 'Manage library', 'Issue, return and fine books'),
  // ── Communication ─────────────────────────────────────────────────────────
  entry('communication', 'communication.read', 'View communication', 'Announcements, events, templates and logs'),
  entry('communication', 'communication.announcements.write', 'Manage announcements', 'Draft and edit announcements'),
  entry('communication', 'communication.announcements.publish', 'Publish announcements', 'Broadcast to the school'),
  entry('communication', 'communication.events.write', 'Manage events', 'Schedule calendar events'),
  entry('communication', 'communication.templates.write', 'Manage templates', 'SMS / email / WhatsApp templates'),
  entry('communication', 'communication.send', 'Send messages', 'Send SMS, email and WhatsApp blasts'),
  // ── Insights ──────────────────────────────────────────────────────────────
  entry('reports', 'reports.read', 'View reports', 'Analytics dashboards'),
  entry('reports', 'reports.write', 'Manage reports', 'Saved filters and scheduled exports'),
  // ── Administration ────────────────────────────────────────────────────────
  entry('users', 'users.read', 'View users', 'User accounts and sign-in status'),
  entry('users', 'users.write', 'Manage users', 'Create, suspend and reset users'),
  entry('roles', 'roles.read', 'View roles', 'Role permission matrix'),
  entry('roles', 'roles.write', 'Edit roles', 'Change role permissions'),
  entry('settings', 'settings.read', 'View settings', 'School settings'),
  entry('settings', 'settings.write', 'Edit settings', 'Change school settings'),
  entry('school', 'school.read', 'View school profile', 'Branches and school details'),
  entry('school', 'school.write', 'Edit school profile', 'Branding and branch management'),
  entry('audit', 'audit.read', 'View audit log', 'Who did what, when'),
  entry('portal', 'portal', 'Portal access', 'Parent / student portal dashboards'),
]

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_CATALOG.map(p => p.key)

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: ['*'],
  PRINCIPAL: [
    '*.read',
    'students.write', 'students.import', 'students.export', 'students.exit',
    'admissions.write', 'admissions.convert',
    'academic.sessions.write', 'academic.classes.write', 'academic.subjects.write',
    'academic.promotions.write', 'academic.lessonplans.write',
    'timetable.write', 'attendance.write', 'attendance.staff.write',
    'exams.write', 'exams.setup', 'exams.marks', 'exams.publish', 'exams.reportcards.write',
    'assignments.write', 'assignments.grade',
    'communication.announcements.write', 'communication.announcements.publish',
    'communication.events.write', 'communication.templates.write', 'communication.send',
    'reports.write', 'hr.leave.write', 'audit.read', 'portal',
  ],
  TEACHER: [
    'students.read', 'admissions.read', 'academic.read',
    'timetable.read', 'timetable.write',
    'attendance.read', 'attendance.write',
    'exams.read', 'exams.marks',
    'assignments.read', 'assignments.write', 'assignments.grade',
    'communication.read', 'reports.read', 'portal',
  ],
  ACCOUNTANT: [
    'students.read', 'academic.read',
    'fees.read', 'fees.structures.write', 'fees.invoices.write', 'fees.payments.write', 'fees.discounts.write',
    'accounts.read', 'accounts.write',
    'reports.read', 'communication.read', 'portal',
  ],
  LIBRARIAN: ['library.read', 'library.write', 'inventory.read', 'students.read', 'communication.read', 'portal'],
  HR: [
    'hr.read', 'hr.employees.write', 'hr.employees.portal', 'hr.salaries.write',
    'hr.payroll.write', 'hr.payroll.settle', 'hr.leave.write',
    'students.read', 'reports.read', 'communication.read', 'portal',
  ],
  PARENT: ['portal', 'communication.read'],
  STUDENT: ['portal', 'communication.read'],
}

export const SYSTEM_ROLES = Object.keys(ROLE_DEFAULTS)

const MODULE_LABELS: Record<string, string> = {
  students: 'Students',
  admissions: 'Admissions',
  academic: 'Academics',
  timetable: 'Timetable',
  attendance: 'Attendance',
  exams: 'Exams & Grades',
  assignments: 'Homework',
  fees: 'Fees & Billing',
  accounts: 'Accounts',
  hr: 'HR & Payroll',
  inventory: 'Inventory',
  library: 'Library',
  communication: 'Communication',
  reports: 'Reports',
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',
  school: 'School',
  audit: 'Audit',
  portal: 'Portal',
}

function titleCaseKey(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Ordered module groups for the roles matrix UI. */
export const PERMISSION_MODULES: { key: string; label: string }[] = [
  ...new Map(PERMISSION_CATALOG.map(p => [p.module, p])).keys(),
].map(key => ({ key, label: MODULE_LABELS[key] ?? titleCaseKey(key) }))

/**
 * Permission match:
 *  '*'        → everything
 *  'fees.*'   → anything starting 'fees.'
 *  '*.read'   → anything ending '.read'
 *  exact      → literal match
 */
export function can(perms: string[], needed?: string): boolean {
  if (!needed) return true
  return perms.some(p => {
    if (p === '*') return true
    if (p.endsWith('.*')) return needed.startsWith(p.slice(0, -1))
    if (p.startsWith('*.')) return needed.endsWith('.' + p.slice(2))
    return p === needed
  })
}

export function mergePermissions(primary: string[], extra: string[] = []): string[] {
  return Array.from(new Set([...primary, ...extra]))
}
