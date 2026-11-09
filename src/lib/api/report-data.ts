// Server-side report builders — shared by the /reports/* REST routes and the
// scheduled export runner. Each report fetches minimal row sets from SQLite
// and aggregates in JS (portable, fast at school scale). Filter options are
// embedded in each response so the UI never needs a second permission-scoped
// fetch (e.g. a librarian with reports.read but no academic.read).

import { db } from '@/lib/db'
import { rowsToCsv } from '@/lib/csv'

const DAY = 24 * 60 * 60 * 1000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isDateParam(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/** Resolve a validated from/to range (defaults: last `days` days ending today). */
export function resolveRange(from?: unknown, to?: unknown, days = 30): { from: string; to: string } {
  const toD = isDateParam(to) ? to : isoDate(new Date())
  const fromD = isDateParam(from)
    ? from
    : isoDate(new Date(new Date(`${toD}T00:00:00`).getTime() - (days - 1) * DAY))
  return { from: fromD, to: toD }
}

/** Month keys between two YYYY-MM-DD strings (inclusive, capped at 24). */
function monthSpan(from: string, to: string): string[] {
  const out: string[] = []
  const end = to.slice(0, 7)
  let cursor = new Date(`${from.slice(0, 7)}-01T00:00:00`)
  for (let i = 0; i < 24; i++) {
    const key = isoDate(cursor).slice(0, 7)
    out.push(key)
    if (key >= end) break
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return out
}

const strFilter = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

// ── Enrollment ────────────────────────────────────────────────────────────────

export interface EnrollmentReport {
  totals: { activeStudents: number; male: number; female: number; classes: number; sections: number; staff: number; openApplicants: number }
  byClass: { classId: string; className: string; level: number; students: number; male: number; female: number; sections: number }[]
  byStatus: { status: string; count: number }[]
  genderMix: { gender: string; count: number }[]
  admissionsTrend: { month: string; label: string; count: number }[]
  staffByDepartment: { department: string; count: number }[]
  staffByType: { type: string; count: number }[]
}

export async function enrollmentReport(schoolId: string): Promise<EnrollmentReport> {
  const [classes, students, employees, applicants] = await Promise.all([
    db.schoolClass.findMany({
      where: { schoolId },
      orderBy: { level: 'asc' },
      select: { id: true, name: true, level: true, sections: { select: { id: true } } },
    }),
    db.student.findMany({
      where: { schoolId },
      select: { classId: true, gender: true, status: true, admissionDate: true },
    }),
    db.employee.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { department: true, employmentType: true },
    }),
    db.applicant.findMany({
      where: { schoolId, status: { in: ['APPLIED', 'INTERVIEW', 'WAITLISTED', 'ADMITTED'] } },
      select: { id: true },
    }),
  ])

  const classRows = classes.map(c => ({
    classId: c.id, className: c.name, level: c.level,
    students: 0, male: 0, female: 0, sections: c.sections.length,
  }))
  const byId = new Map(classRows.map(r => [r.classId, r]))

  const statusCounts = new Map<string, number>()
  const genderCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()
  for (const s of students) {
    statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1)
    const male = s.gender.toUpperCase() === 'MALE'
    genderCounts.set(male ? 'Male' : 'Female', (genderCounts.get(male ? 'Male' : 'Female') ?? 0) + 1)
    const row = s.classId ? byId.get(s.classId) : undefined
    if (row && s.status === 'ACTIVE') {
      row.students += 1
      if (male) row.male += 1
      else row.female += 1
    }
    if (s.admissionDate) {
      const m = s.admissionDate.slice(0, 7)
      monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
    }
  }

  // last 12 months trend
  const trend: EnrollmentReport['admissionsTrend'] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = isoDate(d).slice(0, 7)
    trend.push({
      month: key,
      label: d.toLocaleString('en-NG', { month: 'short', year: '2-digit' }),
      count: monthCounts.get(key) ?? 0,
    })
  }

  const deptCounts = new Map<string, number>()
  const typeCounts = new Map<string, number>()
  for (const e of employees) {
    const dept = e.department?.trim() || 'Unassigned'
    deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1)
    const t = e.employmentType.replace('_', ' ')
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
  }

  const active = statusCounts.get('ACTIVE') ?? 0
  return {
    totals: {
      activeStudents: active,
      male: genderCounts.get('Male') ?? 0,
      female: genderCounts.get('Female') ?? 0,
      classes: classes.length,
      sections: classRows.reduce((a, r) => a + r.sections, 0),
      staff: employees.length,
      openApplicants: applicants.length,
    },
    byClass: classRows,
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    genderMix: ['Male', 'Female'].map(g => ({ gender: g, count: genderCounts.get(g) ?? 0 })),
    admissionsTrend: trend,
    staffByDepartment: [...deptCounts.entries()].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count),
    staffByType: [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  }
}

// ── Academic ──────────────────────────────────────────────────────────────────

export interface AcademicReport {
  exam: { id: string; name: string; term: string; session: string; published: boolean } | null
  exams: { id: string; name: string; term: string }[]
  summary: { entries: number; absent: number; students: number; average: number | null }
  classAverages: { classId: string; className: string; average: number; students: number }[]
  subjectAverages: { subject: string; average: number; entries: number }[]
  gradeDistribution: { grade: string; count: number }[]
  topStudents: { rank: number; studentId: string; name: string; className: string; average: number; subjects: number }[]
}

export async function academicReport(schoolId: string, opts: { examId?: string } = {}): Promise<AcademicReport> {
  const examList = await db.exam.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, name: true, publishResults: true, term: { select: { name: true, session: { select: { name: true } } } } },
  })

  const exam = opts.examId
    ? examList.find(e => e.id === opts.examId) ?? null
    : examList.find(e => e.publishResults) ?? examList[0] ?? null
  if (!exam) {
    return { exam: null, exams: [], summary: { entries: 0, absent: 0, students: 0, average: null }, classAverages: [], subjectAverages: [], gradeDistribution: [], topStudents: [] }
  }

  const results = await db.examResult.findMany({
    where: { schoolId, examId: exam.id },
    select: {
      marksObtained: true, maxMarks: true, absent: true, grade: true,
      student: { select: { id: true, firstName: true, lastName: true } },
      classSubject: { select: { class: { select: { id: true, name: true } }, subject: { select: { name: true } } } },
    },
  })

  const studentAgg = new Map<string, { name: string; className: string; sum: number; count: number }>()
  const classAgg = new Map<string, { name: string; sum: number; count: number; students: Set<string> }>()
  const subjectAgg = new Map<string, { sum: number; count: number }>()
  const gradeAgg = new Map<string, number>()
  let absent = 0

  for (const r of results) {
    const pct = r.maxMarks > 0 ? (r.marksObtained / r.maxMarks) * 100 : 0
    if (r.absent) absent += 1

    const cs = r.classSubject
    const cls = cs.class
    if (cls) {
      const c = classAgg.get(cls.id) ?? { name: cls.name, sum: 0, count: 0, students: new Set<string>() }
      c.sum += pct
      c.count += 1
      c.students.add(r.student.id)
      classAgg.set(cls.id, c)
    }

    const subj = cs.subject.name
    const s = subjectAgg.get(subj) ?? { sum: 0, count: 0 }
    s.sum += pct
    s.count += 1
    subjectAgg.set(subj, s)

    const st = studentAgg.get(r.student.id) ?? { name: `${r.student.firstName} ${r.student.lastName}`, className: cls?.name ?? '—', sum: 0, count: 0 }
    st.sum += pct
    st.count += 1
    studentAgg.set(r.student.id, st)

    const g = r.absent ? 'ABS' : r.grade ?? '—'
    gradeAgg.set(g, (gradeAgg.get(g) ?? 0) + 1)
  }

  const overall = results.length ? results.reduce((a, r) => a + (r.maxMarks ? (r.marksObtained / r.maxMarks) * 100 : 0), 0) / results.length : null
  const round = (n: number) => Math.round(n * 10) / 10

  const top = [...studentAgg.entries()]
    .map(([studentId, v]) => ({ studentId, name: v.name, className: v.className, average: round(v.sum / v.count), subjects: v.count }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 10)
    .map((row, i) => ({ rank: i + 1, ...row }))

  const gradeOrder = (g: string) => (g === 'ABS' ? 'zz' : g)
  return {
    exam: { id: exam.id, name: exam.name, term: exam.term.name, session: exam.term.session.name, published: exam.publishResults },
    exams: examList.map(e => ({ id: e.id, name: e.name, term: e.term.name })),
    summary: { entries: results.length, absent, students: studentAgg.size, average: overall === null ? null : round(overall) },
    classAverages: [...classAgg.entries()].map(([classId, v]) => ({ classId, className: v.name, average: round(v.sum / v.count), students: v.students.size })).sort((a, b) => b.average - a.average),
    subjectAverages: [...subjectAgg.entries()].map(([subject, v]) => ({ subject, average: round(v.sum / v.count), entries: v.count })).sort((a, b) => b.average - a.average),
    gradeDistribution: [...gradeAgg.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => gradeOrder(a.grade).localeCompare(gradeOrder(b.grade))),
    topStudents: top,
  }
}

// ── Financial ─────────────────────────────────────────────────────────────────

export interface FinancialReport {
  range: { from: string; to: string }
  terms: { id: string; name: string; session: string; isCurrent: boolean }[]
  summary: { expected: number; collected: number; outstanding: number; collectionRate: number | null; ledgerIncome: number; ledgerExpense: number; net: number }
  byStatus: { status: string; count: number; total: number; paid: number }[]
  byClass: { className: string; students: number; expected: number; collected: number; outstanding: number }[]
  paymentsByMonth: { month: string; label: string; amount: number }[]
  ledgerByMonth: { month: string; label: string; income: number; expense: number }[]
  expenseByCategory: { category: string; amount: number }[]
  methodMix: { method: string; count: number; amount: number }[]
  defaulters: { studentId: string; name: string; className: string; invoiceNumber: string; balance: number; dueDate: string }[]
}

export async function financialReport(
  schoolId: string,
  opts: { termId?: string; from?: string; to?: string } = {},
): Promise<FinancialReport> {
  const range = resolveRange(opts.from, opts.to, 180)

  const invoiceWhere: Record<string, unknown> = { schoolId }
  if (opts.termId) invoiceWhere.termId = opts.termId

  const [invoices, payments, ledger, terms] = await Promise.all([
    db.feeInvoice.findMany({
      where: invoiceWhere,
      select: {
        invoiceNumber: true, total: true, amountPaid: true, status: true, dueDate: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
      },
    }),
    db.payment.findMany({
      where: { schoolId, paidAt: { gte: range.from, lte: range.to } },
      select: { amount: true, paidAt: true, method: true },
    }),
    db.ledgerEntry.findMany({
      where: { schoolId, date: { gte: range.from, lte: range.to } },
      select: { type: true, category: true, amount: true, date: true },
    }),
    db.term.findMany({
      where: { schoolId },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, isCurrent: true, session: { select: { name: true } } },
    }),
  ])

  const nonVoid = invoices.filter(i => i.status !== 'VOID')
  const expected = nonVoid.reduce((a, i) => a + i.total, 0)
  const collected = nonVoid.reduce((a, i) => a + i.amountPaid, 0)
  const outstanding = Math.max(0, expected - collected)

  const statusAgg = new Map<string, { count: number; total: number; paid: number }>()
  const classAgg = new Map<string, { students: Set<string>; expected: number; collected: number }>()
  for (const inv of invoices) {
    const st = statusAgg.get(inv.status) ?? { count: 0, total: 0, paid: 0 }
    st.count += 1
    st.total += inv.total
    st.paid += inv.amountPaid
    statusAgg.set(inv.status, st)

    if (inv.status !== 'VOID') {
      const key = inv.student.class?.name ?? 'Unassigned'
      const c = classAgg.get(key) ?? { students: new Set<string>(), expected: 0, collected: 0 }
      c.students.add(inv.student.id)
      c.expected += inv.total
      c.collected += inv.amountPaid
      classAgg.set(key, c)
    }
  }

  const months = monthSpan(range.from, range.to)
  const payByMonth = new Map<string, number>()
  const ledgerByMonth = new Map<string, { income: number; expense: number }>()
  const expenseCat = new Map<string, number>()
  const methodAgg = new Map<string, { count: number; amount: number }>()
  for (const m of months) {
    payByMonth.set(m, 0)
    ledgerByMonth.set(m, { income: 0, expense: 0 })
  }
  let ledgerIncome = 0
  let ledgerExpense = 0
  for (const p of payments) {
    const m = p.paidAt.slice(0, 7)
    payByMonth.set(m, (payByMonth.get(m) ?? 0) + p.amount)
    methodAgg.set(p.method, { count: (methodAgg.get(p.method)?.count ?? 0) + 1, amount: (methodAgg.get(p.method)?.amount ?? 0) + p.amount })
  }
  for (const e of ledger) {
    const m = ledgerByMonth.get(e.date.slice(0, 7))
    if (!m) continue
    if (e.type === 'INCOME') { m.income += e.amount; ledgerIncome += e.amount }
    else { m.expense += e.amount; ledgerExpense += e.amount }
    if (e.type === 'EXPENSE') expenseCat.set(e.category, (expenseCat.get(e.category) ?? 0) + e.amount)
  }

  const defaulters = nonVoid
    .filter(i => ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(i.status) && i.total - i.amountPaid > 0)
    .map(i => ({
      studentId: i.student.id,
      name: `${i.student.firstName} ${i.student.lastName}`,
      className: i.student.class?.name ?? '—',
      invoiceNumber: i.invoiceNumber,
      balance: i.total - i.amountPaid,
      dueDate: i.dueDate,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)

  return {
    range,
    terms: terms.map(t => ({ id: t.id, name: t.name, session: t.session.name, isCurrent: t.isCurrent })),
    summary: {
      expected, collected, outstanding,
      collectionRate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null,
      ledgerIncome, ledgerExpense, net: ledgerIncome - ledgerExpense,
    },
    byStatus: [...statusAgg.entries()].map(([status, v]) => ({ status, ...v })).sort((a, b) => b.total - a.total),
    byClass: [...classAgg.entries()].map(([className, v]) => ({ className, students: v.students.size, expected: v.expected, collected: v.collected, outstanding: Math.max(0, v.expected - v.collected) })).sort((a, b) => b.expected - a.expected),
    paymentsByMonth: months.map(m => ({
      month: m,
      label: new Date(`${m}-01T00:00:00`).toLocaleString('en-NG', { month: 'short', year: '2-digit' }),
      amount: payByMonth.get(m) ?? 0,
    })),
    ledgerByMonth: months.map(m => {
      const v = ledgerByMonth.get(m) ?? { income: 0, expense: 0 }
      return {
        month: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleString('en-NG', { month: 'short', year: '2-digit' }),
        ...v,
      }
    }),
    expenseByCategory: [...expenseCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8),
    methodMix: [...methodAgg.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount),
    defaulters,
  }
}

// ── Attendance ────────────────────────────────────────────────────────────────

export interface AttendanceReport {
  range: { from: string; to: string }
  classes: { id: string; name: string }[]
  summary: { records: number; present: number; absent: number; late: number; excused: number; rate: number | null }
  statusMix: { status: string; count: number }[]
  dailyTrend: { date: string; label: string; rate: number | null; present: number; total: number }[]
  byClass: { classId: string; className: string; students: number; present: number; total: number; rate: number | null }[]
  staff: { records: number; present: number; absent: number; late: number; onLeave: number; rate: number | null }
  chronicAbsentees: { studentId: string; name: string; className: string; absences: number; marked: number; rate: number | null }[]
}

const ATT_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const

export async function attendanceReport(
  schoolId: string,
  opts: { from?: string; to?: string; classId?: string } = {},
): Promise<AttendanceReport> {
  const range = resolveRange(opts.from, opts.to, 30)
  const students = await db.student.findMany({
    where: { schoolId, ...(opts.classId ? { classId: opts.classId } : {}), status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, classId: true, class: { select: { name: true } } },
  })
  const ids = students.map(s => s.id)

  const [records, staffGrouped, classList] = await Promise.all([
    ids.length
      ? db.studentAttendance.findMany({
          where: { schoolId, studentId: { in: ids }, date: { gte: range.from, lte: range.to } },
          select: { studentId: true, date: true, status: true },
        })
      : Promise.resolve([] as { studentId: string; date: string; status: string }[]),
    db.staffAttendance.groupBy({
      by: ['status'],
      where: { schoolId, date: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    db.schoolClass.findMany({ where: { schoolId }, orderBy: { level: 'asc' }, select: { id: true, name: true } }),
  ])

  const summaryCounts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  const daily = new Map<string, { present: number; total: number }>()
  const classAgg = new Map<string, { name: string; students: Set<string>; present: number; total: number }>()
  const studentAgg = new Map<string, { marked: number; absences: number }>()

  for (const r of records) {
    if (r.status in summaryCounts) summaryCounts[r.status as keyof typeof summaryCounts] += 1
    const d = daily.get(r.date) ?? { present: 0, total: 0 }
    d.total += 1
    if (r.status === 'PRESENT' || r.status === 'LATE') d.present += 1
    daily.set(r.date, d)

    const stu = students.find(s => s.id === r.studentId)
    if (stu) {
      const key = stu.classId ?? 'none'
      const c = classAgg.get(key) ?? { name: stu.class?.name ?? 'Unassigned', students: new Set<string>(), present: 0, total: 0 }
      c.students.add(stu.id)
      c.total += 1
      if (r.status === 'PRESENT' || r.status === 'LATE') c.present += 1
      classAgg.set(key, c)
    }
    const sa = studentAgg.get(r.studentId) ?? { marked: 0, absences: 0 }
    sa.marked += 1
    if (r.status === 'ABSENT') sa.absences += 1
    studentAgg.set(r.studentId, sa)
  }

  const total = records.length
  const presentish = summaryCounts.PRESENT + summaryCounts.LATE
  const staffBy: Record<string, number> = {}
  let staffTotal = 0
  let staffPresent = 0
  for (const g of staffGrouped) {
    staffBy[g.status] = g._count._all
    staffTotal += g._count._all
    if (g.status === 'PRESENT' || g.status === 'LATE') staffPresent += g._count._all
  }

  // all class rows (even without records) for the filter-driven bar list
  const byClass = classList
    .filter(c => !opts.classId || c.id === opts.classId)
    .map(c => {
      const v = classAgg.get(c.id)
      return {
        classId: c.id, className: c.name,
        students: v?.students.size ?? 0,
        present: v?.present ?? 0,
        total: v?.total ?? 0,
        rate: v && v.total > 0 ? Math.round((v.present / v.total) * 1000) / 10 : null,
      }
    })

  const days: { date: string; label: string; rate: number | null; present: number; total: number }[] = []
  const start = new Date(`${range.from}T00:00:00`)
  const end = new Date(`${range.to}T00:00:00`)
  for (let d = start; d <= end && days.length < 62; d = new Date(d.getTime() + DAY)) {
    const key = isoDate(d)
    const v = daily.get(key)
    days.push({
      date: key,
      label: d.toLocaleString('en-NG', { day: 'numeric', month: 'short' }),
      rate: v && v.total > 0 ? Math.round((v.present / v.total) * 1000) / 10 : null,
      present: v?.present ?? 0,
      total: v?.total ?? 0,
    })
  }

  const chronic = [...studentAgg.entries()]
    .filter(([, v]) => v.absences > 0)
    .sort((a, b) => b[1].absences - a[1].absences)
    .slice(0, 8)
    .map(([studentId, v]) => {
      const stu = students.find(s => s.id === studentId)
      return {
        studentId,
        name: stu ? `${stu.firstName} ${stu.lastName}` : 'Unknown',
        className: stu?.class?.name ?? '—',
        absences: v.absences,
        marked: v.marked,
        rate: v.marked > 0 ? Math.round((1 - v.absences / v.marked) * 1000) / 10 : null,
      }
    })

  return {
    range,
    classes: classList,
    summary: {
      records: total,
      present: summaryCounts.PRESENT,
      absent: summaryCounts.ABSENT,
      late: summaryCounts.LATE,
      excused: summaryCounts.EXCUSED,
      rate: total > 0 ? Math.round((presentish / total) * 1000) / 10 : null,
    },
    statusMix: ATT_STATUSES.map(s => ({ status: s, count: summaryCounts[s] })).filter(s => s.count > 0),
    dailyTrend: days,
    byClass,
    staff: {
      records: staffTotal,
      present: staffBy.PRESENT ?? 0,
      absent: staffBy.ABSENT ?? 0,
      late: staffBy.LATE ?? 0,
      onLeave: staffBy.ON_LEAVE ?? 0,
      rate: staffTotal > 0 ? Math.round((staffPresent / staffTotal) * 1000) / 10 : null,
    },
    chronicAbsentees: chronic,
  }
}

// ── CSV export (used by scheduled exports + "Export CSV" buttons) ─────────────

export interface ReportCsvFile {
  filename: string
  columns: { key: string; label: string }[]
  rows: Record<string, string | number>[]
}

const nairaNum = (kobo: number) => Math.round(kobo) / 100

export const REPORT_LABELS: Record<string, string> = {
  enrollment: 'Enrollment report',
  academic: 'Academic performance report',
  financial: 'Financial summary report',
  attendance: 'Attendance report',
}

/** Run a report by key and flatten it into CSV-ready rows. */
export async function buildReportCsv(
  reportKey: string,
  schoolId: string,
  filters: Record<string, unknown> = {},
): Promise<ReportCsvFile> {
  switch (reportKey) {
    case 'enrollment': {
      const data = await enrollmentReport(schoolId)
      return {
        filename: 'enrollment-report',
        columns: [
          { key: 'className', label: 'Class' },
          { key: 'students', label: 'Active students' },
          { key: 'male', label: 'Male' },
          { key: 'female', label: 'Female' },
          { key: 'sections', label: 'Sections' },
        ],
        rows: data.byClass.map(r => ({ ...r })),
      }
    }
    case 'academic': {
      const data = await academicReport(schoolId, { examId: strFilter(filters.examId) })
      return {
        filename: 'academic-report',
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'name', label: 'Student' },
          { key: 'className', label: 'Class' },
          { key: 'average', label: 'Average %' },
          { key: 'subjects', label: 'Subjects' },
        ],
        rows: data.topStudents.map(r => ({ ...r })),
      }
    }
    case 'financial': {
      const data = await financialReport(schoolId, {
        termId: strFilter(filters.termId),
        from: strFilter(filters.from),
        to: strFilter(filters.to),
      })
      return {
        filename: 'financial-report',
        columns: [
          { key: 'className', label: 'Class' },
          { key: 'students', label: 'Students' },
          { key: 'expected', label: 'Expected (NGN)' },
          { key: 'collected', label: 'Collected (NGN)' },
          { key: 'outstanding', label: 'Outstanding (NGN)' },
        ],
        rows: data.byClass.map(r => ({
          className: r.className, students: r.students,
          expected: nairaNum(r.expected), collected: nairaNum(r.collected), outstanding: nairaNum(r.outstanding),
        })),
      }
    }
    case 'attendance':
    default: {
      const data = await attendanceReport(schoolId, {
        from: strFilter(filters.from),
        to: strFilter(filters.to),
        classId: strFilter(filters.classId),
      })
      return {
        filename: 'attendance-report',
        columns: [
          { key: 'className', label: 'Class' },
          { key: 'students', label: 'Students' },
          { key: 'marked', label: 'Marks recorded' },
          { key: 'present', label: 'Present+Late' },
          { key: 'rate', label: 'Attendance %' },
        ],
        rows: data.byClass.map(r => ({ className: r.className, students: r.students, marked: r.total, present: r.present, rate: r.rate ?? '' })),
      }
    }
  }
}

export function reportCsvString(file: ReportCsvFile): string {
  return rowsToCsv(file.rows as Record<string, unknown>[], file.columns.map(c => ({ key: c.key, label: c.label })))
}
