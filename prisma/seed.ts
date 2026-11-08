/**
 * SchoolDesk seed — realistic Nigerian demo school.
 * Deterministic (seeded RNG) so re-seeding produces stable data.
 * Env overrides: SEED_SCHOOL_NAME, SEED_SCHOOL_SHORT, SEED_CURRENCY
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

const db = new PrismaClient()

// ── helpers ────────────────────────────────────────────────────────────────
const naira = (n: number) => Math.round(n * 100) // ₦ → kobo
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
const pad = (n: number, w = 4) => String(n).padStart(w, '0')

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20250214)
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
const between = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min

const SCHOOL_NAME = process.env.SEED_SCHOOL_NAME || 'Crescent Dawn Group of Schools'
const SCHOOL_SHORT = process.env.SEED_SCHOOL_SHORT || 'CDG'

function todayIso() { return iso(new Date()) }
function lastWeekdays(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  while (out.length < count) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(iso(d))
    d.setDate(d.getDate() - 1)
  }
  return out.reverse()
}
function nextWeekdays(count: number, skipToday = true): string[] {
  const out: string[] = []
  const d = addDays(new Date(), skipToday ? 1 : 0)
  while (out.length < count) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(iso(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ── academic calendar (dynamic) ────────────────────────────────────────────
function academicPlan() {
  const now = new Date()
  const y = now.getFullYear(); const m = now.getMonth() + 1
  const startYear = m >= 8 ? y : y - 1
  const sessionName = `${startYear}/${startYear + 1}`
  const terms = [
    { name: 'FIRST', startDate: `${startYear}-09-08`, endDate: `${startYear}-12-12` },
    { name: 'SECOND', startDate: `${startYear + 1}-01-05`, endDate: `${startYear + 1}-04-04` },
    { name: 'THIRD', startDate: `${startYear + 1}-04-21`, endDate: `${startYear + 1}-07-24` },
  ]
  const currentIdx = m >= 8 ? 0 : m <= 4 ? 1 : 2
  return { sessionName, terms, currentIdx, startYear }
}

// ── role permissions ───────────────────────────────────────────────────────
const ROLE_PERMS: Record<string, string[]> = {
  ADMIN: ['*'],
  PRINCIPAL: ['*.read', 'students.write', 'admissions.write', 'academic.write', 'timetable.write',
    'attendance.write', 'exams.write', 'assignments.write', 'communication.write', 'reports.write',
    'hr.read', 'hr.leave.write', 'audit.read', 'fees.read', 'portal'],
  TEACHER: ['students.read', 'admissions.read', 'academic.read', 'timetable.read', 'timetable.write',
    'attendance.read', 'attendance.write', 'exams.read', 'exams.marks', 'assignments.read',
    'assignments.write', 'communication.read', 'portal', 'reports.read'],
  ACCOUNTANT: ['students.read', 'academic.read', 'fees.*', 'accounts.*', 'reports.read',
    'communication.read', 'communication.fees', 'portal'],
  LIBRARIAN: ['inventory.read', 'inventory.write', 'students.read', 'communication.read', 'portal'],
  HR: ['hr.*', 'students.read', 'reports.read', 'communication.read', 'portal'],
  PARENT: ['portal', 'communication.read'],
  STUDENT: ['portal', 'communication.read'],
}

const STUDIES_SUBJECTS = [
  { name: 'Mathematics', code: 'MTH' },
  { name: 'English Language', code: 'ENG' },
  { name: 'Basic Science', code: 'BSC' },
  { name: 'Civic Education', code: 'CIV' },
  { name: 'Yoruba', code: 'YOR' },
  { name: 'Computer Studies', code: 'CMP' },
  { name: 'Business Studies', code: 'BUS' },
  { name: 'Agricultural Science', code: 'AGR' },
  { name: 'Social Studies', code: 'SOS' },
  { name: 'Christian Religious Studies', code: 'CRS' },
]

const FIRST_NAMES_M = ['Chinedu', 'Emeka', 'Tunde', 'Ibrahim', 'Seyi', 'Oluwaseun', 'Kelechi', 'Yusuf',
  'Babatunde', 'Obinna', 'Abdulrahman', 'Femi', 'Ekene', 'Damilola', 'Uchenna', 'Adebayo']
const FIRST_NAMES_F = ['Aisha', 'Ngozi', 'Funke', 'Amarachi', 'Blessing', 'Chiamaka', 'Fatima', 'Zainab',
  'Yetunde', 'Adaeze', 'Halima', 'Oluwakemi', 'Nneoma', 'Bukola', 'Ifeoma', 'Titilayo']
const LAST_NAMES = ['Okafor', 'Adeyemi', 'Bello', 'Okonkwo', 'Nwosu', 'Eze', 'Musa', 'Ajayi', 'Oyelaran',
  'Abubakar', 'Balogun', 'Ogunleye', 'Chukwu', 'Lawal', 'Onyeka', 'Salami', 'Igwe', 'Afolabi',
  'Danjuma', 'Okoro', 'Alabi', 'Popoola']
const FATHER_FIRST = ['Cyril', 'Emmanuel', 'Abdul', 'Samuel', 'Olusegun', 'Chukwuemeka', 'Ibrahim',
  'Raphael', 'Gbenga', 'Idris', 'Felix', 'Babatunde']

async function wipe() {
  const tables = [
    'auditLog', 'notification', 'communicationLog', 'messageTemplate', 'calendarEvent',
    'announcement', 'bookLoan', 'libraryBook', 'stockMovement', 'supplier', 'item',
    'leaveRequest', 'payslip', 'salaryStructure', 'employee', 'ledgerEntry', 'onlinePayment',
    'payment', 'invoiceInstalment', 'discount', 'feeInvoice', 'feeStructure', 'reportCard',
    'examResult', 'examSchedule', 'exam', 'examType', 'gradeBand', 'gradingScale',
    'assignmentSubmission', 'assignment', 'staffAttendance', 'studentAttendance',
    'timetableSlot', 'period', 'document', 'applicant', 'studentGuardian', 'guardian',
    'student', 'lessonPlan', 'classSubject', 'subject', 'section', 'schoolClass',
    'term', 'academicSession', 'setting', 'role', 'refreshToken', 'user', 'branch', 'school',
  ] as const
  for (const t of tables) await (db as any)[t].deleteMany()
}

async function main() {
  console.log('🧹 Wiping existing data…')
  await wipe()

  const plan = academicPlan()
  const year = new Date().getFullYear()

  // ── school & branches ────────────────────────────────────────────────────
  console.log('🏫 Creating school…')
  const school = await db.school.create({ data: {
    name: SCHOOL_NAME, slug: 'crescent-dawn', type: 'SCHOOL',
    address: '14 Crescent Way, Allen Avenue', city: 'Ikeja', state: 'Lagos', country: 'Nigeria',
    phone: '+234 803 555 0100', email: 'info@crescentdawn.sch.ng',
    motto: 'Knowledge, Character & Service',
    primaryColor: '#0F766E', secondaryColor: '#D97706',
    currency: process.env.SEED_CURRENCY || 'NGN', locale: 'en-NG', timezone: 'Africa/Lagos',
  } })
  const mainBranch = await db.branch.create({ data: {
    schoolId: school.id, name: 'Main Campus (Ikeja)', code: 'MAIN',
    address: '14 Crescent Way, Allen Avenue, Ikeja', phone: '+234 803 555 0100', isMain: true,
  } })
  await db.branch.create({ data: {
    schoolId: school.id, name: 'Abule-Egba Annex', code: 'ANNEX',
    address: '7 College Road, Abule-Egba, Lagos', phone: '+234 803 555 0180', isMain: false,
  } })

  // ── roles ────────────────────────────────────────────────────────────────
  for (const [name, permissions] of Object.entries(ROLE_PERMS)) {
    await db.role.create({ data: { schoolId: school.id, name, permissions: JSON.stringify(permissions), isSystem: true } })
  }

  // ── users ────────────────────────────────────────────────────────────────
  console.log('👥 Creating users…')
  const passwordHash = await hash('Password123!')
  const mkUser = (data: { email: string; fullName: string; role: string; phone?: string }) =>
    db.user.create({ data: { schoolId: school.id, branchId: mainBranch.id, passwordHash, status: 'ACTIVE', ...data } })

  const admin = await mkUser({ email: 'admin@schooldesk.ng', fullName: 'Mrs. Funmilola Johnson', role: 'ADMIN', phone: '+234 803 555 0101' })
  const principalUser = await mkUser({ email: 'principal@schooldesk.ng', fullName: 'Mrs. Adaeze Okonkwo', role: 'PRINCIPAL', phone: '+234 803 555 0102' })
  const accountantUser = await mkUser({ email: 'accountant@schooldesk.ng', fullName: 'Mr. Emeka Obi', role: 'ACCOUNTANT', phone: '+234 803 555 0103' })
  const teacherUser = await mkUser({ email: 'tunde@schooldesk.ng', fullName: 'Mr. Tunde Adeyemi', role: 'TEACHER', phone: '+234 803 555 0104' })
  const librarianUser = await mkUser({ email: 'librarian@schooldesk.ng', fullName: 'Mrs. Halima Bello', role: 'LIBRARIAN', phone: '+234 803 555 0105' })
  const parentUser = await mkUser({ email: 'parent@schooldesk.ng', fullName: 'Mr. Cyril Okafor', role: 'PARENT', phone: '+234 803 555 0111' })
  const studentUser = await mkUser({ email: 'student@schooldesk.ng', fullName: 'Chinedu Okafor', role: 'STUDENT' })

  // ── employees ────────────────────────────────────────────────────────────
  console.log('🧑‍🏫 Creating employees…')
  const employeesData = [
    { user: principalUser, firstName: 'Adaeze', lastName: 'Okonkwo', position: 'Principal', department: 'Admin', basic: 350000, gender: 'FEMALE', email: 'principal@schooldesk.ng' },
    { user: accountantUser, firstName: 'Emeka', lastName: 'Obi', position: 'Bursar', department: 'Admin', basic: 180000, gender: 'MALE', email: 'accountant@schooldesk.ng' },
    { user: teacherUser, firstName: 'Tunde', lastName: 'Adeyemi', position: 'Teacher', department: 'Academic', basic: 140000, gender: 'MALE', email: 'tunde@schooldesk.ng' },
    { user: null, firstName: 'Funke', lastName: 'Oyelaran', position: 'Teacher', department: 'Academic', basic: 135000, gender: 'FEMALE', email: null },
    { user: null, firstName: 'Ibrahim', lastName: 'Musa', position: 'Teacher', department: 'Academic', basic: 130000, gender: 'MALE', email: null },
    { user: null, firstName: 'Chioma', lastName: 'Eze', position: 'Teacher', department: 'Academic', basic: 125000, gender: 'FEMALE', email: null },
    { user: null, firstName: 'Seyi', lastName: 'Ajayi', position: 'Teacher', department: 'Academic', basic: 120000, gender: 'MALE', email: null },
    { user: librarianUser, firstName: 'Halima', lastName: 'Bello', position: 'Librarian', department: 'Ancillary', basic: 100000, gender: 'FEMALE', email: 'librarian@schooldesk.ng' },
  ]
  const employees: Record<string, string> = {}
  for (let i = 0; i < employeesData.length; i++) {
    const e = employeesData[i]
    const emp = await db.employee.create({ data: {
      schoolId: school.id, branchId: mainBranch.id, userId: e.user?.id ?? null,
      staffCode: `STF-${pad(i + 1, 3)}`, firstName: e.firstName, lastName: e.lastName,
      gender: e.gender, email: e.email, phone: `+234 80${between(200000000, 999999999)}`,
      position: e.position, department: e.department, qualification: pick(['B.Ed', 'B.Sc, PGDE', 'NCE', 'M.Ed']),
      employmentDate: `${2018 + (i % 6)}-09-0${1 + (i % 8)}`, employmentType: 'FULL_TIME', status: 'ACTIVE',
    } })
    employees[e.firstName] = emp.id
  }

  // salary structures + payslips
  console.log('💰 Creating payroll…')
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
  const period = `${lastMonthDate.getFullYear()}-${pad(lastMonthDate.getMonth() + 1, 2)}`
  const allEmployees = await db.employee.findMany({ where: { schoolId: school.id } })
  for (const emp of allEmployees) {
    const basic = employeesData.find(e => e.firstName === emp.firstName)!.basic
    const housing = Math.round(basic * 0.10), transport = 10000
    const pension = Math.round(basic * 0.08), tax = Math.round((basic + housing + transport) * 0.07)
    const gross = basic + housing + transport
    const net = gross - pension - tax
    await db.salaryStructure.create({ data: {
      schoolId: school.id, employeeId: emp.id, name: 'Main Scale',
      basicAmount: naira(basic),
      allowances: JSON.stringify([{ label: 'Housing', amount: naira(housing) }, { label: 'Transport', amount: naira(transport) }]),
      deductions: JSON.stringify([{ label: 'Pension (8%)', amount: naira(pension) }, { label: 'PAYE Tax', amount: naira(tax) }]),
      effectiveFrom: '2024-09-01', isActive: true,
    } })
    await db.payslip.create({ data: {
      schoolId: school.id, employeeId: emp.id, period, grossAmount: naira(gross),
      totalDeductions: naira(pension + tax), netAmount: naira(net),
      items: JSON.stringify([
        { label: 'Basic Salary', amount: naira(basic), type: 'EARNING' },
        { label: 'Housing', amount: naira(housing), type: 'EARNING' },
        { label: 'Transport', amount: naira(transport), type: 'EARNING' },
        { label: 'Pension (8%)', amount: naira(pension), type: 'DEDUCTION' },
        { label: 'PAYE Tax', amount: naira(tax), type: 'DEDUCTION' },
      ]),
      status: 'PAID', paidAt: iso(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0)),
    } })
    await db.ledgerEntry.create({ data: {
      schoolId: school.id, type: 'EXPENSE', category: 'SALARIES',
      description: `Salaries — ${period} — ${emp.firstName} ${emp.lastName}`,
      amount: naira(net), date: iso(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0)),
      source: 'PAYROLL', referenceType: 'Payslip',
    } })
    // current month draft
    const nowD = new Date()
    await db.payslip.create({ data: {
      schoolId: school.id, employeeId: emp.id, period: `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1, 2)}`,
      grossAmount: naira(gross), totalDeductions: naira(pension + tax), netAmount: naira(net),
      items: '[]', status: 'DRAFT',
    } })
  }
  await db.leaveRequest.create({ data: {
    schoolId: school.id, employeeId: employees['Tunde'], type: 'ANNUAL',
    startDate: iso(addDays(new Date(), 7)), endDate: iso(addDays(new Date(), 11)),
    reason: 'Family event in Ibadan', status: 'PENDING',
  } })

  // ── sessions, terms ──────────────────────────────────────────────────────
  console.log('📅 Creating academic calendar…')
  const session = await db.academicSession.create({ data: {
    schoolId: school.id, name: plan.sessionName,
    startDate: plan.terms[0].startDate, endDate: plan.terms[2].endDate, isCurrent: true,
  } })
  const terms: { id: string; name: string }[] = []
  for (let i = 0; i < plan.terms.length; i++) {
    const t = await db.term.create({ data: {
      schoolId: school.id, sessionId: session.id, ...plan.terms[i], isCurrent: i === plan.currentIdx,
    } })
    terms.push({ id: t.id, name: t.name })
  }
  const currentTerm = terms[plan.currentIdx]
  const prevTermIdx = plan.currentIdx > 0 ? plan.currentIdx - 1 : 0
  const prevTerm = terms[prevTermIdx]

  // ── classes, sections, subjects ─────────────────────────────────────────
  console.log('🎓 Creating classes & subjects…')
  const classDefs = [
    { name: 'Primary 4', level: 4, category: 'PRIMARY' }, { name: 'Primary 5', level: 5, category: 'PRIMARY' },
    { name: 'Primary 6', level: 6, category: 'PRIMARY' },
    { name: 'JSS 1', level: 7, category: 'JUNIOR_SECONDARY' }, { name: 'JSS 2', level: 8, category: 'JUNIOR_SECONDARY' },
    { name: 'JSS 3', level: 9, category: 'JUNIOR_SECONDARY' },
    { name: 'SS 1', level: 10, category: 'SENIOR_SECONDARY' }, { name: 'SS 2', level: 11, category: 'SENIOR_SECONDARY' },
    { name: 'SS 3', level: 12, category: 'SENIOR_SECONDARY' },
  ]
  const classes: Record<string, string> = {}
  for (const c of classDefs) {
    const row = await db.schoolClass.create({ data: { schoolId: school.id, ...c } })
    classes[c.name] = row.id
  }
  const sections: Record<string, string> = {}
  for (const [name, id] of Object.entries(classes)) {
    const multi = name === 'JSS 1' || name === 'SS 1'
    const list = multi ? ['A', 'B'] : ['A']
    for (const s of list) {
      const row = await db.section.create({ data: { schoolId: school.id, classId: id, name: s, capacity: 40 } })
      sections[`${name} ${s}`] = row.id
    }
  }
  const subjects: Record<string, string> = {}
  for (const s of STUDIES_SUBJECTS) {
    const row = await db.subject.create({ data: { schoolId: school.id, name: s.name, code: s.code, isCore: ['MTH', 'ENG'].includes(s.code) } })
    subjects[s.code] = row.id
  }
  const teacherByCode: Record<string, string> = {
    MTH: employees['Tunde'], ENG: employees['Funke'], BSC: employees['Ibrahim'],
    CMP: employees['Chioma'], SOS: employees['Seyi'],
  }
  const formTeacherBySection: Record<string, string> = {
    'JSS 1 A': employees['Tunde'], 'JSS 1 B': employees['Seyi'], 'SS 1 A': employees['Funke'],
    'Primary 6 A': employees['Ibrahim'], 'SS 2 A': employees['Chioma'],
  }
  for (const [sec, empId] of Object.entries(formTeacherBySection)) {
    await db.section.update({ where: { id: sections[sec] }, data: { formTeacherId: empId } })
  }
  const jssCodes = STUDIES_SUBJECTS.map(s => s.code)
  const ssCodes = ['MTH', 'ENG', 'CIV', 'CMP', 'BUS', 'AGR', 'CRS']
  const priCodes = ['MTH', 'ENG', 'BSC', 'CIV', 'YOR', 'SOS', 'CMP']
  const classSubjectCodes: Record<string, string[]> = {
    'JSS 1': jssCodes, 'SS 1': ssCodes, 'SS 2': ssCodes, 'Primary 6': priCodes,
  }
  const classSubjects: Record<string, string> = {} // `${classKey}:${code}` → id
  for (const [classKey, codes] of Object.entries(classSubjectCodes)) {
    const classId = classes[classKey]
    for (const code of codes) {
      const row = await db.classSubject.create({ data: {
        schoolId: school.id, classId, subjectId: subjects[code],
        teacherId: teacherByCode[code] ?? null,
      } })
      classSubjects[`${classKey}:${code}`] = row.id
    }
  }

  // ── students & guardians ────────────────────────────────────────────────
  console.log('🧒 Creating students & guardians…')
  type Seat = { secKey: string; admitYear: number; dobYear: number }
  const seats: Seat[] = [
    ...Array.from({ length: 12 }, () => ({ secKey: 'JSS 1 A', admitYear: plan.startYear, dobYear: plan.startYear - 13 })),
    ...Array.from({ length: 10 }, () => ({ secKey: 'JSS 1 B', admitYear: plan.startYear, dobYear: plan.startYear - 13 })),
    ...Array.from({ length: 10 }, () => ({ secKey: 'SS 1 A', admitYear: plan.startYear - 1, dobYear: plan.startYear - 16 })),
    ...Array.from({ length: 8 }, () => ({ secKey: 'Primary 6 A', admitYear: plan.startYear - 3, dobYear: plan.startYear - 11 })),
    ...Array.from({ length: 8 }, () => ({ secKey: 'SS 2 A', admitYear: plan.startYear - 2, dobYear: plan.startYear - 17 })),
  ]
  const admitCounters: Record<number, number> = {}
  const studentRows: { id: string; fullName: string; secKey: string }[] = []
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i]
    const female = rng() < 0.5
    let firstName = female ? FIRST_NAMES_F[i % FIRST_NAMES_F.length] : FIRST_NAMES_M[i % FIRST_NAMES_M.length]
    let lastName = LAST_NAMES[(i * 5 + 3) % LAST_NAMES.length]
    if (i === 0) { firstName = 'Chinedu'; lastName = 'Okafor' }
    if (seat.secKey === 'Primary 6 A' && !studentRows.some(s => s.fullName.includes('Amarachi'))) {
      firstName = 'Amarachi'; lastName = 'Okafor'
    }
    const seq = (admitCounters[seat.admitYear] = (admitCounters[seat.admitYear] ?? 0) + 1)
    const clsKey = seat.secKey.split(' ').slice(0, -1).join(' ')
    const st = await db.student.create({ data: {
      schoolId: school.id, branchId: mainBranch.id,
      admissionNumber: `${SCHOOL_SHORT}/${seat.admitYear}/${pad(seq)}`,
      firstName, lastName, gender: female ? 'FEMALE' : 'MALE',
      dateOfBirth: `${seat.dobYear}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`,
      classId: classes[clsKey], sectionId: sections[seat.secKey],
      status: 'ACTIVE', admissionDate: `${seat.admitYear}-09-09`,
      address: `${between(2, 120)} ${pick(['Awolowo', 'Allen', 'Obafemi', 'Sobo', 'Aromire'])} Way, Ikeja, Lagos`,
      bloodGroup: pick(['O+', 'A+', 'B+', 'O-', 'AB+']),
      medicalNotes: rng() < 0.12 ? pick(['Mild asthma — carries inhaler', 'Allergic to peanuts', 'Wears glasses (short-sighted)']) : null,
    } })
    studentRows.push({ id: st.id, fullName: `${firstName} ${lastName}`, secKey: seat.secKey })
  }
  // guardians (one per student; Cyril Okafor parents both siblings via one Guardian row)
  const siblingIds = studentRows.filter(s => s.fullName.includes('Okafor')).map(s => s.id)
  const cyril = await db.guardian.create({ data: {
    schoolId: school.id, userId: parentUser.id,
    firstName: 'Cyril', lastName: 'Okafor', relationship: 'FATHER',
    phone: '+234 803 1000 111', email: 'parent@schooldesk.ng',
    occupation: 'Civil Engineer',
    address: '12 Awolowo Way, Ikeja, Lagos', isPrimary: true,
  } })
  for (let i = 0; i < studentRows.length; i++) {
    const s = studentRows[i]
    const isCyril = siblingIds.includes(s.id)
    let guardianId = cyril.id
    if (!isCyril) {
      const gFirst = FATHER_FIRST[i % FATHER_FIRST.length]
      const gLast = s.fullName.split(' ')[1]
      const guardian = await db.guardian.create({ data: {
        schoolId: school.id,
        firstName: gFirst, lastName: gLast, relationship: 'FATHER',
        phone: `+234 803 ${pad(1000 + i, 4)} ${pad(between(100, 999), 3)}`,
        occupation: pick(['Civil Servant', 'Trader', 'Engineer', 'Nurse', 'Banker', 'Teacher', 'Business Owner']),
        address: `${between(2, 120)} ${pick(['Awolowo', 'Allen', 'Sobo'])} Way, Ikeja, Lagos`,
        isPrimary: true,
      } })
      guardianId = guardian.id
    }
    await db.studentGuardian.create({ data: { studentId: s.id, guardianId } })
  }

  // ── timetable ───────────────────────────────────────────────────────────
  console.log('⏰ Creating timetable…')
  const periodDefs = [
    { name: 'Assembly', startTime: '07:45', endTime: '08:00', order: 0, isBreak: false },
    { name: 'Period 1', startTime: '08:00', endTime: '08:40', order: 1, isBreak: false },
    { name: 'Period 2', startTime: '08:45', endTime: '09:25', order: 2, isBreak: false },
    { name: 'Period 3', startTime: '09:30', endTime: '10:10', order: 3, isBreak: false },
    { name: 'Break', startTime: '10:10', endTime: '10:40', order: 4, isBreak: true },
    { name: 'Period 4', startTime: '10:40', endTime: '11:20', order: 5, isBreak: false },
    { name: 'Period 5', startTime: '11:25', endTime: '12:05', order: 6, isBreak: false },
    { name: 'Period 6', startTime: '12:10', endTime: '12:50', order: 7, isBreak: false },
    { name: 'Lunch', startTime: '12:50', endTime: '13:20', order: 8, isBreak: true },
    { name: 'Period 7', startTime: '13:20', endTime: '14:00', order: 9, isBreak: false },
    { name: 'Period 8', startTime: '14:05', endTime: '14:45', order: 10, isBreak: false },
  ]
  const periods: Record<string, string> = {}
  for (const p of periodDefs) {
    const row = await db.period.create({ data: { schoolId: school.id, ...p } })
    periods[p.name] = row.id
  }
  const teachingPeriods = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7', 'Period 8']
  const dayPlan = (dayIdx: number) => {
    const pool = jssCodes
    return Array.from({ length: 8 }, (_, k) => pool[(dayIdx * 3 + k) % pool.length])
  }
  for (let d = 0; d < 5; d++) {
    const codes = dayPlan(d)
    for (let k = 0; k < 8; k++) {
      const code = codes[k]
      await db.timetableSlot.create({ data: {
        schoolId: school.id, termId: currentTerm.id,
        classId: classes['JSS 1'], sectionId: sections['JSS 1 A'],
        day: d, periodId: periods[teachingPeriods[k]],
        classSubjectId: classSubjects[`JSS 1:${code}`], teacherId: teacherByCode[code] ?? null,
      } })
    }
    await db.timetableSlot.create({ data: {
      schoolId: school.id, termId: currentTerm.id, classId: classes['JSS 1'], sectionId: sections['JSS 1 A'],
      day: d, periodId: periods['Assembly'], classSubjectId: null, teacherId: null,
    } })
  }

  // ── attendance (last 21 weekdays) ───────────────────────────────────────
  console.log('📋 Creating attendance…')
  const days = lastWeekdays(21)
  const attRows: any[] = []
  for (const day of days) {
    for (const s of studentRows) {
      const r = rng()
      const status = r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : r < 0.99 ? 'ABSENT' : 'EXCUSED'
      attRows.push({
        schoolId: school.id, studentId: s.id, date: day, periodId: null, status,
        remarks: status === 'EXCUSED' ? 'Medical appointment' : null,
      })
    }
  }
  await db.studentAttendance.createMany({ data: attRows })

  // ── grading scale + exams ───────────────────────────────────────────────
  console.log('📝 Creating exams & results…')
  const bands = [
    { grade: 'A1', minScore: 75, maxScore: 100, remark: 'Excellent' },
    { grade: 'B2', minScore: 70, maxScore: 74, remark: 'Very Good' },
    { grade: 'B3', minScore: 65, maxScore: 69, remark: 'Good' },
    { grade: 'C4', minScore: 60, maxScore: 64, remark: 'Credit' },
    { grade: 'C5', minScore: 55, maxScore: 59, remark: 'Credit' },
    { grade: 'C6', minScore: 50, maxScore: 54, remark: 'Credit' },
    { grade: 'D7', minScore: 45, maxScore: 49, remark: 'Pass' },
    { grade: 'E8', minScore: 40, maxScore: 44, remark: 'Pass' },
    { grade: 'F9', minScore: 0, maxScore: 39, remark: 'Fail' },
  ]
  const scale = await db.gradingScale.create({ data: { schoolId: school.id, name: 'WAEC Standard', isDefault: true } })
  for (const b of bands) await db.gradeBand.create({ data: { scaleId: scale.id, ...b } })

  const examTypeFinal = await db.examType.create({ data: { schoolId: school.id, name: 'Final Term Exam', weight: 100 } })
  await db.examType.create({ data: { schoolId: school.id, name: 'First Continuous Assessment', weight: 30 } })
  const examTypeMid = await db.examType.create({ data: { schoolId: school.id, name: 'Mid-Term Test', weight: 30 } })

  const gradeFor = (pct: number) => bands.find(b => pct >= b.minScore && pct <= b.maxScore) ?? bands[8]

  // published exam — previous term, JSS 1 A + SS 1 A
  const publishedExam = await db.exam.create({ data: {
    schoolId: school.id, termId: prevTerm.id, examTypeId: examTypeFinal.id,
    name: `${prevTerm.name.replace('_', ' ').charAt(0) + prevTerm.name.slice(1).toLowerCase()} Examination — ${plan.sessionName}`,
    startDate: prevTerm === terms[plan.currentIdx] ? iso(addDays(new Date(), -30)) : prevTerm === terms[1] ? `${plan.terms[1].startDate}` : plan.terms[0].startDate,
    endDate: iso(addDays(new Date(), -18)), publishResults: true, publishClassScores: true,
  } })
  const resultExamClasses: { secKey: string; classKey: string; codes: string[] }[] = [
    { secKey: 'JSS 1 A', classKey: 'JSS 1', codes: jssCodes }, { secKey: 'SS 1 A', classKey: 'SS 1', codes: ssCodes },
  ]
  for (const { secKey, classKey, codes } of resultExamClasses) {
    const roster = studentRows.filter(s => s.secKey === secKey)
    const perStudent: Record<string, { total: number; count: number }> = {}
    for (const code of codes) {
      await db.examSchedule.create({ data: {
        schoolId: school.id, examId: publishedExam.id,
        classSubjectId: classSubjects[`${classKey}:${code}`],
        date: iso(addDays(new Date(), -25)), startTime: '09:00', endTime: '11:00',
        maxMarks: 100, passMarks: 40,
      } })
      for (const s of roster) {
        const marks = Math.min(98, Math.max(38, Math.round(52 + rng() * 45)))
        const pct = marks
        const g = gradeFor(pct)
        await db.examResult.create({ data: {
          schoolId: school.id, examId: publishedExam.id, studentId: s.id,
          classSubjectId: classSubjects[`${classKey}:${code}`],
          marksObtained: marks, maxMarks: 100, grade: g.grade, remark: g.remark,
        } })
        perStudent[s.id] = perStudent[s.id] ?? { total: 0, count: 0 }
        perStudent[s.id].total += marks; perStudent[s.id].count += 1
      }
    }
    const ranked = Object.entries(perStudent)
      .map(([studentId, v]) => ({ studentId, average: v.total / v.count, total: v.total, count: v.count }))
      .sort((a, b) => b.average - a.average)
    await Promise.all(ranked.map(async (r, idx) => {
      const g = gradeFor(r.average)
      const remark = r.average >= 70 ? 'An outstanding result. Keep it up!' :
        r.average >= 55 ? 'A good performance. Aim higher next term.' :
        r.average >= 45 ? 'Fair result. More effort is needed.' : 'Needs close monitoring and support.'
      await db.reportCard.create({ data: {
        schoolId: school.id, examId: publishedExam.id, studentId: r.studentId,
        totalScore: Math.round(r.total), average: Math.round(r.average * 100) / 100,
        position: idx + 1, grade: g.grade,
        attendanceSummary: `Present ${18 + (idx % 3)}/21, Late ${idx % 2}`,
        teacherRemark: remark, principalRemark: idx < 3 ? 'Commended performance.' : null,
        published: true,
      } }).catch(() => null)
    }))
  }
  // current term mid-term exam (unpublished, no marks yet)
  const midTermExam = await db.exam.create({ data: {
    schoolId: school.id, termId: currentTerm.id, examTypeId: examTypeMid.id,
    name: `${currentTerm.name === 'SECOND' ? 'Second' : currentTerm.name === 'THIRD' ? 'Third' : 'First'} Term Mid-Term Test — ${plan.sessionName}`,
    startDate: nextWeekdays(1)[0], endDate: iso(addDays(new Date(), 7)),
    publishResults: false, publishClassScores: false,
  } })
  const midDates = nextWeekdays(4)
  jssCodes.slice(0, 4).forEach((code, i) => {
    db.examSchedule.create({ data: {
      schoolId: school.id, examId: midTermExam.id, classSubjectId: classSubjects[`JSS 1:${code}`],
      date: midDates[i % midDates.length], startTime: '09:00', endTime: '10:30', maxMarks: 60, passMarks: 25,
    } }).catch(() => null)
  })

  // staff attendance today
  const today = todayIso()
  for (const [i, emp] of allEmployees.entries()) {
    await db.staffAttendance.create({ data: {
      schoolId: school.id, employeeId: emp.id, date: today,
      status: i === 4 ? 'LATE' : i === 7 ? 'ON_LEAVE' : 'PRESENT',
      checkIn: i === 4 ? '08:20' : '07:40', checkOut: null,
    } })
  }

  // ── fees ────────────────────────────────────────────────────────────────
  console.log('🏦 Creating fees, invoices & payments…')
  const feeItems = (primary: boolean) => primary ? [
    { label: 'Tuition', amount: naira(45000) }, { label: 'Levies', amount: naira(12000) },
    { label: 'PTA Dues', amount: naira(4000) }, { label: 'Sports & Utilities', amount: naira(4000) },
  ] : [
    { label: 'Tuition', amount: naira(60000) }, { label: 'Levies', amount: naira(15000) },
    { label: 'PTA Dues', amount: naira(5000) }, { label: 'Sports & Utilities', amount: naira(5000) },
  ]
  const feeStructures: Record<string, string> = {}
  for (const classKey of Object.keys(classSubjectCodes)) {
    const isPrimary = classKey.startsWith('Primary')
    const items = feeItems(isPrimary)
    const row = await db.feeStructure.create({ data: {
      schoolId: school.id, name: `${classKey} — ${currentTerm.name === 'SECOND' ? 'Second' : currentTerm.name === 'THIRD' ? 'Third' : 'First'} Term Fees`,
      classId: classes[classKey], termId: currentTerm.id, sessionId: session.id,
      items: JSON.stringify(items), totalAmount: items.reduce((a, b) => a + b.amount, 0), isActive: true,
    } })
    feeStructures[classKey] = row.id
  }
  // scholarship discount for an SS 1 A student
  const scholar = studentRows.find(s => s.secKey === 'SS 1 A')!
  await db.discount.create({ data: {
    schoolId: school.id, studentId: scholar.id, name: 'Merit Scholarship (25%)',
    type: 'PERCENT', value: 25, sessionId: session.id, active: true,
  } })

  const methods = ['TRANSFER', 'CASH', 'POS']
  let invSeq = 0, rcpSeq = 0
  for (let i = 0; i < studentRows.length; i++) {
    const s = studentRows[i]
    const classKey = s.secKey.split(' ').slice(0, -1).join(' ')
    const structureId = feeStructures[classKey]
    const fs = await db.feeStructure.findUnique({ where: { id: structureId } })
    const items = JSON.parse(fs!.items) as { label: string; amount: number }[]
    const subtotal = items.reduce((a, b) => a + b.amount, 0)
    const hasDiscount = s.id === scholar.id
    const discountAmount = hasDiscount ? Math.round(subtotal * 0.25) : 0
    const total = subtotal - discountAmount
    invSeq++
    const bucket = i % 10
    let status = bucket < 6 ? 'PAID' : bucket < 8 ? 'PARTIAL' : bucket === 8 ? 'UNPAID' : 'OVERDUE'
    const dueDate = status === 'OVERDUE' ? iso(addDays(new Date(), -10)) : iso(addDays(new Date(), 14))
    const paid = status === 'PAID' ? total : status === 'PARTIAL' ? Math.round(total * 0.45) : 0
    const invoice = await db.feeInvoice.create({ data: {
      schoolId: school.id, invoiceNumber: `INV-${year}-${pad(invSeq, 6)}`,
      studentId: s.id, termId: currentTerm.id, sessionId: session.id, feeStructureId: structureId,
      items: JSON.stringify(items), subtotal, discountAmount, total, amountPaid: paid, status, dueDate,
      notes: hasDiscount ? '25% merit scholarship applied' : null,
      createdById: accountantUser.id,
    } })
    if (i === 2) {
      await db.invoiceInstalment.create({ data: { invoiceId: invoice.id, label: '1st instalment (60%)', amount: Math.round(total * 0.6), dueDate: iso(addDays(new Date(), 3)) } })
      await db.invoiceInstalment.create({ data: { invoiceId: invoice.id, label: '2nd instalment (40%)', amount: total - Math.round(total * 0.6), dueDate: iso(addDays(new Date(), 25)) } })
    }
    if (paid > 0) {
      rcpSeq++
      const payDate = status === 'OVERDUE' ? iso(addDays(new Date(), -14)) : iso(addDays(new Date(), -between(0, 20)))
      const payment = await db.payment.create({ data: {
        schoolId: school.id, invoiceId: invoice.id, receiptNumber: `RCP-${year}-${pad(rcpSeq, 6)}`,
        amount: paid, method: methods[i % 3], reference: `TRF${Date.now()}${i}`,
        paidAt: payDate, recordedById: accountantUser.id,
        note: status === 'PARTIAL' ? 'Part payment — balance before mid-term break' : null,
      } })
      await db.ledgerEntry.create({ data: {
        schoolId: school.id, type: 'INCOME', category: 'TUITION',
        description: `Fee payment — ${s.fullName} (${invoice.invoiceNumber})`,
        amount: paid, date: payDate, source: 'FEE', referenceType: 'Payment', referenceId: payment.id,
        recordedById: accountantUser.id,
      } })
    }
  }

  // extra cashflow history (5 previous months) for the dashboard chart
  for (let back = 5; back >= 1; back--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back)
    const mIso = iso(d).slice(0, 7)
    await db.ledgerEntry.createMany({ data: [
      { schoolId: school.id, type: 'INCOME', category: 'TUITION', description: `Fee collections — ${mIso}`, amount: naira(between(1600, 2100) * 1000), date: iso(d), source: 'FEE', recordedById: accountantUser.id },
      { schoolId: school.id, type: 'INCOME', category: 'OTHER_INCOME', description: `PTA levies & Misc — ${mIso}`, amount: naira(between(180, 320) * 1000), date: iso(addDays(d, 10)), source: 'FEE', recordedById: accountantUser.id },
      { schoolId: school.id, type: 'EXPENSE', category: 'SALARIES', description: `Salary advances — ${mIso}`, amount: naira(between(1150, 1350) * 1000), date: iso(addDays(d, 2)), source: 'PAYROLL', recordedById: accountantUser.id },
      { schoolId: school.id, type: 'EXPENSE', category: 'UTILITIES', description: `Generator diesel — ${mIso}`, amount: naira(between(90, 160) * 1000), date: iso(addDays(d, 8)), source: 'MANUAL', recordedById: accountantUser.id },
      { schoolId: school.id, type: 'EXPENSE', category: 'MAINTENANCE', description: `Repairs & upkeep — ${mIso}`, amount: naira(between(40, 110) * 1000), date: iso(addDays(d, 15)), source: 'MANUAL', recordedById: accountantUser.id },
    ] })
  }
  await db.ledgerEntry.create({ data: { schoolId: school.id, type: 'EXPENSE', category: 'UTILITIES', description: 'Diesel supply (500L)', amount: naira(412500), date: iso(addDays(new Date(), -4)), source: 'MANUAL', recordedById: accountantUser.id } })

  // ── admissions ──────────────────────────────────────────────────────────
  console.log('📨 Creating applicants…')
  const applicants = [
    { firstName: 'Adaeze', lastName: 'Umeh', gender: 'FEMALE', status: 'APPLIED', classKey: 'JSS 1', parentName: 'Mr.chike Umeh' },
    { firstName: 'Oluwaseun', lastName: 'Ajao', gender: 'MALE', status: 'APPLIED', classKey: 'SS 1', parentName: 'Mrs. Bisi Ajao' },
    { firstName: 'Aminat', lastName: 'Lawal', gender: 'FEMALE', status: 'INTERVIEW', classKey: 'JSS 1', parentName: 'Alhaji Kunle Lawal', interviewAt: iso(addDays(new Date(), 3)) },
    { firstName: 'Chibueze', lastName: 'Nwankwo', gender: 'MALE', status: 'ADMITTED', classKey: 'JSS 1', parentName: 'Mr. Obiora Nwankwo' },
    { firstName: 'Tochukwu', lastName: 'Obi', gender: 'MALE', status: 'REJECTED', classKey: 'SS 1', parentName: 'Mr. Ifeanyi Obi' },
  ]
  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i]
    await db.applicant.create({ data: {
      schoolId: school.id, applicationNumber: `APP-${year}-${pad(i + 1)}`,
      firstName: a.firstName, lastName: a.lastName, gender: a.gender,
      dateOfBirth: `${plan.startYear - 12}-0${between(1, 9)}-1${between(0, 8)}`,
      classAppliedId: classes[a.classKey], parentName: a.parentName,
      parentPhone: `+234 802 ${pad(3000 + i, 4)} ${pad(between(100, 999), 3)}`,
      parentEmail: null, previousSchool: pick(['Little Stars Academy', 'Grace Model School', 'Bright Future College', null] as any),
      notes: a.status === 'REJECTED' ? 'Did not meet SS 1 entrance benchmark' : null,
      status: a.status, interviewAt: (a as any).interviewAt ?? null,
      decidedAt: a.status === 'ADMITTED' || a.status === 'REJECTED' ? iso(addDays(new Date(), -2)) : null,
    } })
  }

  // ── assignments ─────────────────────────────────────────────────────────
  await db.assignment.create({ data: {
    schoolId: school.id, classId: classes['JSS 1'], subjectId: subjects['MTH'],
    teacherId: employees['Tunde'], title: 'Problem Solving Worksheet 4',
    description: 'Solve questions 1–20 on simple equations. Show all workings in your exercise book.',
    dueDate: iso(addDays(new Date(), 3)),
  } })
  await db.assignment.create({ data: {
    schoolId: school.id, classId: classes['JSS 1'], subjectId: subjects['ENG'],
    teacherId: employees['Funke'], title: 'Comprehension & Essay',
    description: 'Read "The Value of Honest Work" (page 54) and write a 250-word essay on honesty.',
    dueDate: iso(addDays(new Date(), 5)),
  } })

  // ── inventory & library ─────────────────────────────────────────────────
  console.log('📦 Creating inventory & library…')
  const supplier1 = await db.supplier.create({ data: { schoolId: school.id, name: 'Lagos Stationers Ltd', contactName: 'Mr. Nnamdi Ibe', phone: '+234 805 222 3344', email: 'sales@lagosstationers.ng', address: '5 Ganiyu Street, Ojota, Lagos' } })
  const supplier2 = await db.supplier.create({ data: { schoolId: school.id, name: 'Prime Books Nigeria', contactName: 'Mrs. Ada Umeh', phone: '+234 807 444 5566', email: 'orders@primebooks.ng', address: '22 Gbagada Expressway, Lagos' } })
  const itemsDef = [
    { name: 'Whiteboard Markers', sku: 'STA-MRK', category: 'Stationery', unit: 'pcs', stockQty: 120, reorderLevel: 24, unitPrice: naira(350) },
    { name: 'Box of Chalk', sku: 'STA-CHL', category: 'Stationery', unit: 'box', stockQty: 45, reorderLevel: 12, unitPrice: naira(800) },
    { name: 'A4 Paper Ream', sku: 'STA-A4', category: 'Stationery', unit: 'ream', stockQty: 60, reorderLevel: 20, unitPrice: naira(6500) },
    { name: 'Generator Diesel', sku: 'OPS-Dsl', category: 'Operations', unit: 'litre', stockQty: 480, reorderLevel: 200, unitPrice: naira(1250) },
    { name: 'School Uniform Set', sku: 'UNI-SET', category: 'Uniform', unit: 'set', stockQty: 85, reorderLevel: 20, unitPrice: naira(15000) },
    { name: 'Exercise Book (40 leaves)', sku: 'STA-EX40', category: 'Stationery', unit: 'pcs', stockQty: 520, reorderLevel: 150, unitPrice: naira(250) },
  ]
  for (const it of itemsDef) {
    const row = await db.item.create({ data: { schoolId: school.id, ...it, description: null } })
    await db.stockMovement.create({ data: {
      schoolId: school.id, itemId: row.id, type: 'IN', quantity: it.stockQty, unitCost: it.unitPrice,
      reason: 'Opening stock purchase', supplierId: it.category === 'Stationery' ? supplier1.id : supplier2.id,
      date: iso(addDays(new Date(), -20)),
    } })
  }

  const booksDef = [
    { title: 'Things Fall Apart', author: 'Chinua Achebe', isbn: '978-0385474542', category: 'Literature', totalCopies: 6, availableCopies: 5 },
    { title: 'New General Mathematics JSS 1', author: 'M.F. Macrae', isbn: '978-0582606', category: 'Mathematics', totalCopies: 5, availableCopies: 4 },
    { title: 'Without a Silver Spoon', author: 'Eddie Iroh', isbn: '978-978-023', category: 'Literature', totalCopies: 3, availableCopies: 3 },
    { title: 'Sugar Girl', author: 'Kola Onadipe', isbn: '978-978-2013', category: 'Literature', totalCopies: 4, availableCopies: 3 },
    { title: 'Basic Science for JSS', author: 'STAN', isbn: '978-978-126', category: 'Science', totalCopies: 4, availableCopies: 4 },
    { title: 'The Passport of Mallam Ilia', author: 'Cyprian Ekwensi', isbn: '978-978-2011', category: 'Literature', totalCopies: 2, availableCopies: 2 },
  ]
  const bookIds: string[] = []
  for (const b of booksDef) {
    const row = await db.libraryBook.create({ data: { schoolId: school.id, ...b, shelf: `SH-${between(1, 6)}` } })
    bookIds.push(row.id)
  }
  const chinedu = studentRows[0]
  await db.bookLoan.create({ data: {
    schoolId: school.id, bookId: bookIds[0], borrowerType: 'STUDENT', borrowerId: chinedu.id,
    borrowerName: chinedu.fullName, borrowedAt: iso(addDays(new Date(), -10)), dueDate: iso(addDays(new Date(), 4)), status: 'ISSUED',
  } })
  const ss1Student = studentRows.find(s => s.secKey === 'SS 1 A')!
  await db.bookLoan.create({ data: {
    schoolId: school.id, bookId: bookIds[1], borrowerType: 'STUDENT', borrowerId: ss1Student.id,
    borrowerName: ss1Student.fullName, borrowedAt: iso(addDays(new Date(), -20)), dueDate: iso(addDays(new Date(), -6)),
    status: 'OVERDUE', fineAmount: naira(300),
  } })
  await db.bookLoan.create({ data: {
    schoolId: school.id, bookId: bookIds[3], borrowerType: 'STUDENT', borrowerId: studentRows.find(s => s.secKey === 'SS 2 A')!.id,
    borrowerName: 'SS 2 Student', borrowedAt: iso(addDays(new Date(), -40)), dueDate: iso(addDays(new Date(), -26)),
    returnedAt: iso(addDays(new Date(), -24)), status: 'RETURNED', fineAmount: naira(0),
  } })

  // ── communication ───────────────────────────────────────────────────────
  console.log('📣 Creating communication…')
  await db.announcement.create({ data: {
    schoolId: school.id, title: 'Second Term PTA Meeting',
    body: 'The Parents-Teachers Association meeting holds on Saturday at 10:00 AM in the main hall. All parents are encouraged to attend as we discuss the digital learning initiative and school bus routes.',
    audience: 'ALL', pinned: true, publishedAt: addDays(new Date(), -2), createdById: admin.id,
  } })
  await db.announcement.create({ data: {
    schoolId: school.id, title: 'Inter-House Sports Festival',
    body: 'Our annual Inter-House Sports Festival comes up at the end of this month. House kits are now available at the bookshop. Parents are warmly invited!',
    audience: 'ALL', pinned: false, publishedAt: addDays(new Date(), -5), createdById: admin.id,
  } })
  await db.announcement.create({ data: {
    schoolId: school.id, title: 'Staff Meeting — Results Compilation',
    body: 'All academic staff should submit continuous assessment scores on the portal before Friday. Workbook review holds in the conference room at 2:00 PM.',
    audience: 'STAFF', pinned: false, publishedAt: addDays(new Date(), -1), createdById: principalUser.id,
  } })
  await db.announcement.create({ data: {
    schoolId: school.id, title: 'New Library Hours (Draft)',
    body: 'Proposed: library now opens 7:30 AM – 4:30 PM on weekdays.',
    audience: 'ALL', pinned: false, publishedAt: null, createdById: librarianUser.id,
  } })
  await db.calendarEvent.createMany({ data: [
    { schoolId: school.id, title: 'Mid-Term Break', type: 'HOLIDAY', startDate: iso(addDays(new Date(), 10)), endDate: iso(addDays(new Date(), 12)), audience: 'ALL', createdById: admin.id },
    { schoolId: school.id, title: 'Open Day', type: 'ACTIVITY', startDate: iso(addDays(new Date(), 17)), endDate: iso(addDays(new Date(), 17)), audience: 'ALL', createdById: admin.id },
    { schoolId: school.id, title: 'Mid-Term Test Week', type: 'EXAM', startDate: iso(addDays(new Date(), 3)), endDate: iso(addDays(new Date(), 7)), audience: 'ALL', createdById: principalUser.id },
  ] })
  await db.messageTemplate.createMany({ data: [
    { schoolId: school.id, name: 'Fee Reminder', channel: 'SMS', body: 'Dear {{parent}}, a reminder that {{student}}\'s outstanding fee is {{amount}}, due {{date}}. Pay via transfer or the portal. — ' + SCHOOL_SHORT },
    { schoolId: school.id, name: 'Absence Alert', channel: 'SMS', body: 'Dear {{parent}}, {{student}} was marked {{status}} today {{date}}. Please contact the school if this is unexpected. — ' + SCHOOL_SHORT },
    { schoolId: school.id, name: 'Result Published', channel: 'EMAIL', subject: '{{student}}\'s result is ready', body: 'Dear {{parent}}, the result for {{exam}} is now available on the parent portal. — ' + SCHOOL_SHORT },
  ] })
  await db.communicationLog.createMany({ data: [
    { schoolId: school.id, channel: 'SMS', recipient: '+234 803 1000 111', body: 'Fee reminder sent to Okafor family', status: 'SIMULATED', provider: 'mock', createdById: accountantUser.id },
    { schoolId: school.id, channel: 'EMAIL', recipient: 'parent@schooldesk.ng', subject: 'PTA Meeting — Saturday', body: 'Sent via mock adapter', status: 'SIMULATED', provider: 'mock', sentAt: addDays(new Date(), -2), createdById: admin.id },
  ] })
  await db.notification.createMany({ data: [
    { schoolId: school.id, userId: admin.id, title: 'Leave request awaiting your approval', body: 'Mr. Tunde Adeyemi requested annual leave (5 days).', type: 'LEAVE', link: '#/hr/leave' },
    { schoolId: school.id, userId: parentUser.id, title: 'Fee reminder', body: 'Outstanding balance on invoice for Chinedu Okafor.', type: 'FEE', link: '#/portal' },
    { schoolId: school.id, userId: studentUser.id, title: 'New homework posted', body: 'Mathematics — Problem Solving Worksheet 4, due in 3 days.', type: 'ANNOUNCEMENT', link: '#/portal' },
  ] })

  // ── audit trail & settings ──────────────────────────────────────────────
  console.log('🛡️ Creating audit trail & settings…')
  await db.auditLog.createMany({ data: [
    { schoolId: school.id, userId: admin.id, userName: 'Mrs. Funmilola Johnson', action: 'LOGIN', entity: 'Auth', summary: 'Signed in', createdAt: addDays(new Date(), -1) },
    { schoolId: school.id, userId: accountantUser.id, userName: 'Mr. Emeka Obi', action: 'UPDATE', entity: 'FeeInvoice', entityId: 'INV', summary: 'Recorded fee payment (RCP)', createdAt: addDays(new Date(), -2) },
    { schoolId: school.id, userId: admin.id, userName: 'Mrs. Funmilola Johnson', action: 'CREATE', entity: 'Announcement', summary: 'Published "Second Term PTA Meeting"', createdAt: addDays(new Date(), -2) },
    { schoolId: school.id, userId: principalUser.id, userName: 'Mrs. Adaeze Okonkwo', action: 'PUBLISH', entity: 'Exam', summary: 'Published examination results', createdAt: addDays(new Date(), -6) },
    { schoolId: school.id, userId: teacherUser.id, userName: 'Mr. Tunde Adeyemi', action: 'UPDATE', entity: 'StudentAttendance', summary: 'Marked daily attendance — JSS 1 A', createdAt: addDays(new Date(), -1) },
    { schoolId: school.id, userId: admin.id, userName: 'Mrs. Funmilola Johnson', action: 'EXPORT', entity: 'Report', summary: 'Exported students list (CSV)', createdAt: addDays(new Date(), -3) },
  ] })
  await db.setting.createMany({ data: [
    { schoolId: school.id, key: 'grading.defaultScaleId', value: JSON.stringify(scale.id) },
    { schoolId: school.id, key: 'sms.driver', value: JSON.stringify('mock') },
    { schoolId: school.id, key: 'email.driver', value: JSON.stringify('mock') },
    { schoolId: school.id, key: 'whatsapp.driver', value: JSON.stringify('mock') },
    { schoolId: school.id, key: 'payments.driver', value: JSON.stringify('mock') },
    { schoolId: school.id, key: 'admissionNumber.pattern', value: JSON.stringify(`${SCHOOL_SHORT}/{year}/{seq:4}`) },
  ] })

  console.log(`✅ Seed complete: ${studentRows.length} students, ${allEmployees.length} employees, ${terms.length} terms.`)
  console.log('   Logins (password: Password123!):')
  console.log('   admin@ / principal@ / accountant@ / tunde@ / librarian@ / parent@ / student@schooldesk.ng')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
