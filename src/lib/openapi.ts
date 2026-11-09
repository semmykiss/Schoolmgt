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

  // ── HR & payroll (Phase 8) ────────────────────────────────────────────────
  '/hr/employees': {
    get: { summary: 'Staff directory (search, department, status, portal=linked|unlinked) with active salary gross', tags: ['HR'], responses: okResp() },
    post: { summary: 'Onboard a staff member (staff code auto-assigned STF-####)', tags: ['HR'], requestBody: jsonBody(), responses: okResp() },
  },
  '/hr/employees/{id}': {
    get: { summary: 'Staff profile: linked login, salary structures (gross/net), recent payslips and leave requests', tags: ['HR'], responses: okResp() },
    patch: { summary: 'Update profile/employment fields', tags: ['HR'], requestBody: jsonBody(), responses: okResp() },
    delete: { summary: 'Archive staff (soft-delete → status LEFT; history preserved)', tags: ['HR'], responses: okResp() },
  },
  '/hr/employees/{id}/portal-access': op('post', 'CREATE_LOGIN (role + email, temp password if omitted) or RESET_PASSWORD for the staff login', 'HR', { requestBody: jsonBody() }),
  '/hr/salary-structures': {
    get: { summary: 'List salary structures (?employeeId=) with computed gross/net', tags: ['HR'], responses: okResp() },
    post: { summary: 'Attach a pay scale to an employee (activating deactivates the previous one)', tags: ['HR'], requestBody: jsonBody(), responses: okResp() },
  },
  '/hr/salary-structures/{id}': {
    patch: { summary: 'Edit or activate/deactivate a salary structure', tags: ['HR'], requestBody: jsonBody(), responses: okResp() },
    delete: { summary: 'Delete a salary structure (generated payslips keep their snapshot)', tags: ['HR'], responses: okResp() },
  },
  '/hr/payslips': op('get', 'Payroll register for ?period=YYYY-MM (default current) with status/department/search filters and summary totals', 'HR'),
  '/hr/payslips/generate': op('post', 'Batch-generate DRAFT payslips for {period} from active salary structures (idempotent — existing slips skipped)', 'HR', { requestBody: jsonBody() }),
  '/hr/payslips/{id}': op('get', 'Single payslip with parsed breakdown items', 'HR'),
  '/hr/payslips/{id}/mark-paid': op('patch', 'Settle a DRAFT payslip → PAID and post a SALARIES expense to the ledger (idempotent)', 'HR'),
  '/hr/leave-requests': {
    get: { summary: 'Leave register (?status=, ?employeeId=)', tags: ['HR'], responses: okResp() },
    post: { summary: 'File a leave request — HR may file for anyone; staff with a linked profile may file for themselves; overlapping pending/approved ranges rejected', tags: ['HR'], requestBody: jsonBody(), responses: okResp() },
  },
  '/hr/leave-requests/{id}/decide': op('post', 'Approve or reject a PENDING request (notifies the staff login)', 'HR', { requestBody: jsonBody() }),

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

  // ── Exams & report cards ────────────────────────────────────────────────
  '/exams': { get: op('get', 'List exams (termId, examTypeId, search) with schedule/result counts + published summary', 'Exams')['get'],
    post: op('post', 'Create an exam (one exam type per term)', 'Exams', { requestBody: jsonBody() })['post'] },
  '/exams/{id}': {
    get: op('get', 'Exam detail with full paper timetable (schedules + classes)', 'Exams')['get'],
    patch: op('patch', 'Update exam name/type/dates', 'Exams', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete an exam (blocked while results are published)', 'Exams')['delete'],
  },
  '/exams/{id}/publish': op('post', 'Publish/unpublish results and/or class scores; flips every report card published flag', 'Exams', { requestBody: jsonBody() }),
  '/exams/exam-types': { get: op('get', 'List exam types with exam counts', 'Exams')['get'],
    post: op('post', 'Create an exam type (name + weight %)', 'Exams', { requestBody: jsonBody() })['post'] },
  '/exams/exam-types/{id}': {
    patch: op('patch', 'Update an exam type', 'Exams', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete an exam type (blocked while exams reference it)', 'Exams')['delete'],
  },
  '/exams/schedules': { get: op('get', 'List papers scheduled for ?examId', 'Exams')['get'],
    post: op('post', 'Schedule a paper — 409 on duplicate subject or same-class time clash', 'Exams', { requestBody: jsonBody() })['post'] },
  '/exams/schedules/{id}': {
    patch: op('patch', 'Update paper date/time/max marks', 'Exams', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Remove a paper (blocked when scores are entered)', 'Exams')['delete'],
  },
  '/exams/{id}/marks-sheet': { get: op('get', 'Marks sheet ?classSubjectId= — roster + saved scores + default grading bands', 'Exams')['get'],
    post: op('post', 'Bulk save scores with auto-grading from the default scale (blocked once published)', 'Exams', { requestBody: jsonBody() })['post'] },
  '/exams/broadsheet': op('get', 'Broadsheet ?examId&classId — students × subjects matrix, totals, averages, positions, subject stats', 'Exams'),
  '/exams/grading-scales': { get: op('get', 'List grading scales with bands (default first)', 'Exams')['get'],
    post: op('post', 'Create a grading scale with nested bands', 'Exams', { requestBody: jsonBody() })['post'] },
  '/exams/grading-scales/{id}': {
    patch: op('patch', 'Update a scale (bands replaced wholesale)', 'Exams', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a scale (default scale protected)', 'Exams')['delete'],
  },
  '/report-cards': { get: op('get', '?examId&classId list, or ?examId&studentId full printable payload (school header, subjects, remarks, grading key)', 'Exams')['get'],
    post: op('post', 'Generate/refresh report cards for {examId, classId}: totals, averages, competition-ranked positions, auto remarks', 'Exams', { requestBody: jsonBody() })['post'] },
  '/report-cards/{id}': op('patch', 'Update teacher/principal remarks or publish one report card', 'Exams', { requestBody: jsonBody() }),

  // ── Homework / assignments ─────────────────────────────────────────────
  '/assignments': { get: op('get', 'List homework (classId, subjectId, search; teachers see their own posts) with class size + submission counts', 'Assignments')['get'],
    post: op('post', 'Post homework {classId, subjectId, title, description?, dueDate} — notifies portal-linked students & parents', 'Assignments', { requestBody: jsonBody() })['post'] },
  '/assignments/{id}': {
    get: op('get', 'Get one homework post', 'Assignments')['get'],
    patch: op('patch', 'Update homework (teachers limited to their own posts)', 'Assignments', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete homework and its submissions (teachers limited to their own posts)', 'Assignments')['delete'],
  },
  '/assignments/{id}/submissions': {
    get: op('get', 'Submission roster — every active student in the class joined with their submission state', 'Assignments')['get'],
    post: op('post', 'Student/parent turn-in {studentId?, note?} — idempotent upsert; LATE derived from due date (blocked once graded)', 'Assignments', { requestBody: jsonBody() })['post'],
    patch: op('patch', 'Grade a submission {studentId, score} → status GRADED + parent/student notification', 'Assignments', { requestBody: jsonBody() })['patch'],
  },
  '/assignments/portal': op('get', 'Role-aware homework list — students see their class + own submission, parents per child, teachers their posts with progress', 'Assignments'),

  // ── Parent & student portals ───────────────────────────────────────────
  '/portal/overview': op('get', 'Role-aware portal dashboard (PARENT/STUDENT): per-child attendance %, latest published results, fees due, homework roll-up, today\'s timetable, announcements', 'Portal'),
  '/portal/child/{studentId}': op('get', 'Guardian-verified drill-in: portal summary + invoices, payments, recent attendance marks, published report cards', 'Portal'),

  // ── Communication (announcements, events, messaging) ───────────────────
  '/communication/announcements': { get: op('get', 'List announcements (status=published|draft, audience, search) — pinned first', 'Communication')['get'],
    post: op('post', 'Draft an announcement {title, body, audience, classId?, pinned?}', 'Communication', { requestBody: jsonBody() })['post'] },
  '/communication/announcements/{id}': {
    get: op('get', 'Get one announcement', 'Communication')['get'],
    patch: op('patch', 'Update announcement {published: true|false} publishes/unpublishes in place', 'Communication', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete an announcement everywhere', 'Communication')['delete'],
  },
  '/communication/announcements/{id}/publish': op('post', 'Publish a draft — fans out in-app notifications to the targeted audience (idempotent)', 'Communication'),
  '/communication/events': { get: op('get', 'List calendar events (?from&to range, ?type, ?upcoming=1)', 'Communication')['get'],
    post: op('post', 'Schedule a calendar event {title, type, startDate, endDate, audience, classId?}', 'Communication', { requestBody: jsonBody() })['post'] },
  '/communication/events/{id}': {
    get: op('get', 'Get one event', 'Communication')['get'],
    patch: op('patch', 'Update an event', 'Communication', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Remove an event from the calendar', 'Communication')['delete'],
  },
  '/communication/templates': { get: op('get', 'List reusable message templates (channel, search)', 'Communication')['get'],
    post: op('post', 'Create a template {name, channel, subject?, body} — placeholders {{school}}, {{name}}, {{student}}, {{date}}', 'Communication', { requestBody: jsonBody() })['post'] },
  '/communication/templates/{id}': {
    get: op('get', 'Get one template', 'Communication')['get'],
    patch: op('patch', 'Update a template (name unique per school)', 'Communication', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a template (already-sent logs unaffected)', 'Communication')['delete'],
  },
  '/communication/send': op('post', 'Broadcast {channel, templateId?, subject?, body?, audience} — resolves contacts, renders placeholders, sends via configured driver, logs every message', 'Communication', { requestBody: jsonBody() }),
  '/communication/send/preview': op('post', 'Recipient estimate for a broadcast spec — count + 5 samples without sending', 'Communication', { requestBody: jsonBody() }),
  '/communication/logs': op('get', 'Delivery log (channel, status, search) + status counts', 'Communication'),

  // ── Inventory (Phase 9) ─────────────────────────────────────────────────
  '/inventory/items': { get: op('get', 'Stock catalogue (search, category, pagination) with low-stock flags and value stats', 'Inventory')['get'],
    post: op('post', 'Register a stock item {name, sku?, category?, unit, reorderLevel, unitPrice?}', 'Inventory', { requestBody: jsonBody() })['post'] },
  '/inventory/items/{id}': {
    patch: op('patch', 'Edit item details (price, reorder level…)', 'Inventory', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete an item and its movement history', 'Inventory')['delete'],
  },
  '/inventory/movements': { get: op('get', 'Stock card (?itemId=, ?type=, ?from&to=)', 'Inventory')['get'],
    post: op('post', 'Record IN / OUT / ADJUST — applied atomically; restock alerts fire when stock crosses the reorder level', 'Inventory', { requestBody: jsonBody() })['post'] },
  '/inventory/suppliers': { get: op('get', 'Supplier directory (search)', 'Inventory')['get'],
    post: op('post', 'Add a supplier {name, contactName?, phone?, email?, address?, notes?}', 'Inventory', { requestBody: jsonBody() })['post'] },
  '/inventory/suppliers/{id}': {
    patch: op('patch', 'Update a supplier', 'Inventory', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Delete a supplier', 'Inventory')['delete'],
  },

  // ── Library (Phase 9) ───────────────────────────────────────────────────
  '/library/books': { get: op('get', 'Catalogue (search title/author/isbn, category, available=1) with copy stats', 'Library')['get'],
    post: op('post', 'Catalogue a book {title, author?, isbn?, category?, shelf?, totalCopies}', 'Library', { requestBody: jsonBody() })['post'] },
  '/library/books/{id}': {
    patch: op('patch', 'Edit a book — growing totalCopies tops up availability', 'Library', { requestBody: jsonBody() })['patch'],
    delete: op('delete', 'Remove a book (blocked while copies are still out)', 'Library')['delete'],
  },
  '/library/loans': { get: op('get', 'Issuing register (status, bookId, search) — lazily flags overdue loans', 'Library')['get'],
    post: op('post', 'Issue a book to a student or staff member {bookId, borrowerType, borrowerId, dueDate}', 'Library', { requestBody: jsonBody() })['post'] },
  '/library/loans/{id}/return': op('patch', 'Receive a book back — fine auto-computes (₦50/day, capped) unless overridden', 'Library', { requestBody: jsonBody() }),
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
