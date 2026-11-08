// OpenAPI 3.1 document — grows with each module phase.

const info = {
  title: 'SchoolDesk API',
  version: '1.0.0',
  description: 'Multi-tenant school management API. All endpoints are prefixed with /api/v1 and scoped to the authenticated user\'s school. Auth uses httpOnly JWT access + rotating refresh cookies.',
}

const jsonBody = (schema?: object) => ({ required: true, content: { 'application/json': { schema: schema ?? {} } } })
const okResp = (description = 'Success') => ({ 200: { description, content: { 'application/json': { schema: { type: 'object', properties: { data: {} } } } } } })

function op(method: string, summary: string, tag: string, extra: Record<string, unknown> = {}) {
  return { [method]: { summary, tags: [tag], responses: okResp(), ...extra } }
}

const paths: Record<string, unknown> = {
  '/auth/register': {
    post: { summary: 'Create a school + administrator account (onboarding)', tags: ['Auth'],
      requestBody: jsonBody(), responses: okResp('Session cookies set') },
  },
  '/auth/login': op('post', 'Sign in with email + password', 'Auth', { requestBody: jsonBody() }),
  '/auth/refresh': op('post', 'Rotate refresh token, issue new access token', 'Auth'),
  '/auth/logout': op('post', 'Revoke refresh token and clear cookies', 'Auth'),
  '/auth/me': op('get', 'Current user, permissions, school branding and branches', 'Auth'),
  '/auth/change-password': op('post', 'Change own password (revokes all sessions)', 'Auth', { requestBody: jsonBody() }),

  '/users': { get: { summary: 'List users (search, role, status, pagination)', tags: ['Users'], responses: okResp() },
    post: { summary: 'Create a user', tags: ['Users'], requestBody: jsonBody(), responses: okResp() } },
  '/users/{id}': {
    patch: { summary: 'Update a user (name, role, status, password reset)', tags: ['Users'], requestBody: jsonBody(), responses: okResp() },
    delete: { summary: 'Delete a user', tags: ['Users'], responses: okResp() },
  },
  '/roles': op('get', 'List roles with permissions + full permission catalogue', 'Roles'),
  '/roles/{name}': op('patch', 'Update a role\'s permission matrix (ADMIN role is locked)', 'Roles', { requestBody: jsonBody() }),
  '/school': { get: op('get', 'Get current school profile', 'School')['get'],
    patch: op('patch', 'Update school profile/branding', 'School', { requestBody: jsonBody() })['patch'] },
  '/branches': { get: op('get', 'List branches', 'School')['get'],
    post: { summary: 'Create a branch', tags: ['School'], requestBody: jsonBody(), responses: okResp() } },
  '/settings': { get: op('get', 'Get all school settings (key/value)', 'Settings')['get'],
    put: op('put', 'Upsert a setting', 'Settings', { requestBody: jsonBody() })['put'] },
  '/dashboard': op('get', 'Dashboard widgets: counts, today attendance, fees month, upcoming exams, recent admissions/activity, 6-month cashflow', 'Dashboard'),
  '/search': op('get', 'Global search across students and staff (?q=)', 'Search'),
  '/notifications': op('get', 'Latest notifications for the signed-in user', 'Notifications'),
  '/notifications/read': op('post', 'Mark notifications read ({ids[]} or {all:true})', 'Notifications', { requestBody: jsonBody() }),

  '/employees': op('get', 'List active staff (lightweight picker used by academic modules; extended by HR phase)', 'HR'),

  // ── Academic ────────────────────────────────────────────────────────────
  '/academics/sessions': { get: op('get', 'List academic sessions with nested terms', 'Academic')['get'],
    post: op('post', 'Create a session (optionally set as current)', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/sessions/{id}': {
    patch: op('patch', 'Update a session (rename, dates, set current)', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a session (blocked when exams exist under its terms)', 'Academic')['delete'],
  },
  '/academics/terms': { get: op('get', 'List terms (optionally by sessionId)', 'Academic')['get'],
    post: op('post', 'Create a term in a session', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/terms/{id}': {
    patch: op('patch', 'Update a term', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a term (blocked when exams exist)', 'Academic')['delete'],
  },
  '/academics/terms/{id}/activate': op('post', 'Set a term (and its session) as the current one', 'Academic'),
  '/academics/classes': { get: op('get', 'List classes with sections, form teachers and counts', 'Academic')['get'],
    post: op('post', 'Create a class (name, level, category)', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/classes/{id}': {
    patch: op('patch', 'Update a class', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a class (blocked when active students or open applicants exist)', 'Academic')['delete'],
  },
  '/academics/sections': op('post', 'Create a section (arm) in a class with optional form teacher', 'Academic', { requestBody: jsonBody() }),
  '/academics/sections/{id}': {
    patch: op('patch', 'Update a section (name, capacity, form teacher)', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a section (blocked when students are assigned)', 'Academic')['delete'],
  },
  '/academics/subjects': { get: op('get', 'List subjects', 'Academic')['get'],
    post: op('post', 'Create a subject (name, code, core flag)', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/subjects/{id}': {
    patch: op('patch', 'Update a subject', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a subject (blocked when offered in classes)', 'Academic')['delete'],
  },
  '/academics/class-subjects': { get: op('get', 'List subject offerings per class (filter by classId/teacherId)', 'Academic')['get'],
    post: op('post', 'Offer a subject in a class with optional teacher', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/class-subjects/{id}': {
    patch: op('patch', 'Assign/clear the teacher for a class subject', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Remove a subject from a class (blocked when exam results exist)', 'Academic')['delete'],
  },
  '/academics/lesson-plans': { get: op('get', 'List lesson plans/syllabus (filter classSubjectId, termId, type)', 'Academic')['get'],
    post: op('post', 'Create a lesson plan or syllabus entry', 'Academic', { requestBody: jsonBody() })['post'] },
  '/academics/lesson-plans/{id}': {
    patch: op('patch', 'Update a lesson plan', 'Academic', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a lesson plan', 'Academic')['delete'],
  },
  '/academics/promotions': { get: op('get', 'Preview promotion plan for ?classId — suggested moves, graduates, warnings', 'Academic')['get'],
    post: op('post', 'Run promotions ({entries:[{studentId, action, toClassId}]})', 'Academic', { requestBody: jsonBody() })['post'] },

  // ── Admissions ──────────────────────────────────────────────────────────
  '/admissions/applicants': { get: op('get', 'List applicants with pipeline stage counts (filter status, search)', 'Admissions')['get'],
    post: op('post', 'Create an application (auto APP-YYYY-#### number)', 'Admissions', { requestBody: jsonBody() })['post'] },
  '/admissions/applicants/{id}': {
    get: op('get', 'Applicant detail with allowed pipeline transitions', 'Admissions')['get'],
    patch: op('patch', 'Update applicant / move stage (interview, waitlist, reject)', 'Admissions', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete an application (blocked once converted)', 'Admissions')['delete'],
  },
  '/admissions/applicants/{id}/convert': op('post', 'Convert an applicant into an enrolled student (auto admission number)', 'Admissions', { requestBody: jsonBody() }),

  // ── Students ────────────────────────────────────────────────────────────
  '/students': { get: op('get', 'List students (classId, sectionId, status, gender, search, pagination)', 'Students')['get'],
    post: op('post', 'Enrol a student (auto admission number PREFIX/YEAR/####)', 'Students', { requestBody: jsonBody() })['post'] },
  '/students/{id}': {
    get: op('get', 'Student profile: guardians, siblings (shared guardians), fees & attendance summary', 'Students')['get'],
    patch: op('patch', 'Update bio, class/section, medical fields, status', 'Students', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a student (blocked when invoices/results exist — use exit)', 'Students')['delete'],
  },
  '/students/{id}/guardians': { post: op('post', 'Link a guardian ({guardianId} or {new:{…}})', 'Students', { requestBody: jsonBody() })['post'],
    delete: op('delete', 'Unlink a guardian (?guardianId=)', 'Students')['delete'] },
  '/students/{id}/exit': op('post', 'Record transfer/graduation/suspension/withdrawal with exit metadata', 'Students', { requestBody: jsonBody() }),
  '/students/import': op('post', 'Bulk CSV import ({rows:[…]}) with per-row report', 'Students', { requestBody: jsonBody() }),
  '/students/export': op('get', 'Export filtered students as CSV (same filters as list)', 'Students'),
  '/guardians': op('get', 'Search guardians (name/phone) for linking + sibling resolution', 'Students'),

  // ── Timetable ───────────────────────────────────────────────────────────
  '/timetable/periods': { get: op('get', 'List periods in daily order (with slot counts)', 'Timetable')['get'],
    post: op('post', 'Create a period (name, HH:MM times, order, break flag)', 'Timetable', { requestBody: jsonBody() })['post'] },
  '/timetable/periods/{id}': {
    patch: op('patch', 'Update a period', 'Timetable', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a period (blocked while timetable slots reference it)', 'Timetable')['delete'],
  },
  '/timetable/slots': { get: op('get', 'List slots (termId defaults to current; filters classId, sectionId, teacherId, day)', 'Timetable')['get'],
    post: op('post', 'Schedule a lesson — 409 on class or teacher clash', 'Timetable', { requestBody: jsonBody() })['post'] },
  '/timetable/slots/{id}': {
    patch: op('patch', 'Move/edit a slot — clash-checked against the whole day', 'Timetable', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Clear a slot', 'Timetable')['delete'],
  },
  '/timetable/grid': op('get', 'Grid editor payload: term, periods, class slots, all term slots (clash prechecks), class subjects, staff list', 'Timetable'),
  '/timetable/copy': op('post', 'Copy one class+section timetable onto another (target must be empty; missing subjects skipped, double-booked teachers cleared)', 'Timetable', { requestBody: jsonBody() }),

  // ── Attendance ──────────────────────────────────────────────────────────
  '/attendance': { get: op('get', 'Register: active students of a class for ?date (+optional sectionId/periodId) with saved marks', 'Attendance')['get'],
    post: op('post', 'Save the whole register in one shot; whole-day absences notify portal-linked parents', 'Attendance', { requestBody: jsonBody() })['post'] },
  '/attendance/summary': op('get', 'Monthly analytics: totals, per-student tallies and a per-day series (daily registers only)', 'Attendance'),
  '/attendance/staff': { get: op('get', 'Staff register for ?date — active employees with saved marks', 'Attendance')['get'],
    post: op('post', 'Save the whole staff register for the day', 'Attendance', { requestBody: jsonBody() })['post'] },

  // ── Fees ────────────────────────────────────────────────────────────────
  '/fees/structures': { get: op('get', 'List fee structures (filters classId, termId, sessionId, search)', 'Fees')['get'],
    post: op('post', 'Create a fee structure (JSON line items, total in kobo)', 'Fees', { requestBody: jsonBody() })['post'] },
  '/fees/structures/{id}': {
    patch: op('patch', 'Update a fee structure', 'Fees', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete (or deactivate when used by invoices) a fee structure', 'Fees')['delete'],
  },
  '/fees/invoices': { get: op('get', 'List invoices (status, termId, sessionId, classId, studentId, search) + status counts', 'Fees')['get'],
    post: op('post', 'Raise an invoice (auto INV-YYYY-###### number, computed totals/status)', 'Fees', { requestBody: jsonBody() })['post'] },
  '/fees/invoices/bulk': op('post', 'Bulk-generate invoices for a class/section from a fee structure (skips students already invoiced that term)', 'Fees', { requestBody: jsonBody() }),
  '/fees/invoices/{id}': {
    get: op('get', 'Invoice detail: student, guardians, payments, active discounts, live balance', 'Fees')['get'],
    patch: op('patch', 'Edit items/discount/due date/notes (manual status override blocked while balance outstanding)', 'Fees', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Void an invoice (blocked when payments exist)', 'Fees')['delete'],
  },
  '/fees/invoices/{id}/payments': { get: op('get', 'List payments on an invoice', 'Payments')['get'],
    post: op('post', 'Record a payment — atomic: receipt RCP-YYYY-######, invoice status update, instalment allocation, income ledger entry', 'Payments', { requestBody: jsonBody() })['post'] },
  '/fees/invoices/{id}/payments/{paymentId}': op('delete', 'Reverse a payment (restores balance, removes ledger entry)', 'Payments'),
  '/fees/discounts': { get: op('get', 'List discounts (filter studentId, active)', 'Fees')['get'],
    post: op('post', 'Grant a discount (PERCENT 1-100 or FIXED kobo)', 'Fees', { requestBody: jsonBody() })['post'] },
  '/fees/discounts/{id}': {
    patch: op('patch', 'Update a discount (name, value, active)', 'Fees', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a discount', 'Fees')['delete'],
  },
  '/fees/summary': op('get', 'Collections overview: billed/collected/outstanding, status counts, top defaulters, recent payments', 'Fees'),

  // ── Accounts ────────────────────────────────────────────────────────────
  '/accounts/ledger': { get: op('get', 'List ledger entries (type, category, date range) + income/expense/net totals', 'Accounts')['get'],
    post: op('post', 'Add a manual income/expense entry', 'Accounts', { requestBody: jsonBody() })['post'] },
  '/accounts/ledger/{id}': {
    patch: op('patch', 'Edit a manual entry (system-generated entries are locked)', 'Accounts', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a manual entry', 'Accounts')['delete'],
  },
  '/accounts/summary': op('get', 'Income vs expense analytics: monthly series, category breakdown, net position (?from&to)', 'Accounts'),
}

export const openApiDoc = {
  openapi: '3.1.0',
  info,
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth' }, { name: 'Users' }, { name: 'Roles' }, { name: 'School' }, { name: 'Settings' },
    { name: 'Dashboard' }, { name: 'Search' }, { name: 'Notifications' },
    { name: 'Academic' }, { name: 'Admissions' }, { name: 'Students' }, { name: 'Timetable' },
    { name: 'Attendance' }, { name: 'Exams' }, { name: 'Assignments' }, { name: 'Fees' },
    { name: 'Payments' }, { name: 'Accounts' }, { name: 'HR' }, { name: 'Inventory' },
    { name: 'Library' }, { name: 'Communication' }, { name: 'Portal' }, { name: 'Reports' },
  ],
  paths,
}

export function registerPaths(entries: Record<string, unknown>) {
  Object.assign(paths, entries)
}
