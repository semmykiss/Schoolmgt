// Shared portal data helpers (Phase 6) — resolve portal users to their
// student/guardian/employee records and build per-student summaries.
// Server-only: touches the database.

import { db } from '@/lib/db'
import { forbidden } from './errors'
import type { AuthedUser } from '@/lib/auth/session'

export interface StudentWithClass {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  otherName: string | null
  photoUrl: string | null
  classId: string | null
  sectionId: string | null
  class: { id: string; name: string; level: number } | null
  section: { id: string; name: string } | null
}

export function fullNameOf(s: { firstName: string; lastName: string; otherName?: string | null }): string {
  return [s.firstName, s.lastName, s.otherName].filter(Boolean).join(' ')
}

/** Employee rows store first/last — compose a display name. */
export function employeeName(e: { firstName: string; lastName: string } | null | undefined): string | null {
  if (!e) return null
  return [e.firstName, e.lastName].filter(Boolean).join(' ') || null
}

export function isoToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isoDaysFromToday(delta: number): string {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Resolvers ───────────────────────────────────────────────────────────────

/** The school's current term (falls back to the most recent term). */
export async function currentTerm(schoolId: string) {
  return await db.term.findFirst({
    where: { schoolId, isCurrent: true },
    include: { session: { select: { name: true } } },
  }) ?? await db.term.findFirst({
    where: { schoolId },
    orderBy: { startDate: 'desc' },
    include: { session: { select: { name: true } } },
  })
}

/** Student record linked to a portal login (student self-service). */
export async function studentOfUser(schoolId: string, userId: string): Promise<StudentWithClass | null> {
  const s = await db.student.findFirst({
    where: { schoolId, userId, status: 'ACTIVE' },
    include: {
      class: { select: { id: true, name: true, level: true } },
      section: { select: { id: true, name: true } },
    },
  })
  return s as StudentWithClass | null
}

/** Active children of a parent/guardian portal login. */
export async function childrenOfUser(schoolId: string, userId: string): Promise<StudentWithClass[]> {
  const guardian = await db.guardian.findFirst({ where: { schoolId, userId } })
  if (!guardian) return []
  const links = await db.studentGuardian.findMany({
    where: { guardianId: guardian.id },
    include: {
      student: {
        include: {
          class: { select: { id: true, name: true, level: true } },
          section: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { student: { firstName: 'asc' } },
  })
  return links
    .map(l => l.student)
    .filter(s => s.status === 'ACTIVE') as StudentWithClass[]
}

/** Employee record linked to a staff login (used for "posted by me" scoping). */
export async function employeeOfUser(schoolId: string, userId: string) {
  return db.employee.findFirst({ where: { schoolId, userId } })
}

/**
 * For STUDENT/PARENT logins: the students the caller may act on.
 * STUDENT → own record; PARENT → all children; staff → empty (not portal actors).
 */
export async function portalStudentsFor(user: AuthedUser): Promise<StudentWithClass[]> {
  if (user.role === 'STUDENT') {
    const self = await studentOfUser(user.schoolId, user.id)
    return self ? [self] : []
  }
  if (user.role === 'PARENT') return childrenOfUser(user.schoolId, user.id)
  return []
}

/** Throws unless the caller is a portal actor (parent/student) allowed to act on studentId. */
export async function assertPortalStudentAccess(user: AuthedUser, studentId?: string | null): Promise<StudentWithClass> {
  const students = await portalStudentsFor(user)
  if (students.length === 0) throw forbidden('Your account is not linked to a student portal profile')
  const target = studentId ? students.find(s => s.id === studentId) : students[0]
  if (!target) throw forbidden('You can only manage your own child\'s work')
  return target
}

/** Ownership rule for staff managing an assignment. */
export async function assertAssignmentManageable(
  user: AuthedUser,
  assignment: { id: string; teacherId: string | null },
): Promise<void> {
  if (user.role !== 'TEACHER') return
  const emp = await employeeOfUser(user.schoolId, user.id)
  if (!emp || assignment.teacherId !== emp.id) {
    throw forbidden('You can only manage homework you posted')
  }
}

// ── Per-student portal summary ──────────────────────────────────────────────

export interface StudentPortalSummary {
  id: string
  fullName: string
  admissionNumber: string
  className: string | null
  sectionName: string | null
  photoUrl: string | null
  attendance: { pct: number; present: number; late: number; absent: number; total: number }
  results: { examName: string; average: number; grade: string | null; position: number } | null
  fees: { dueKobo: number; unpaidCount: number; overdueCount: number; nextDueDate: string | null }
  homework: {
    submitted: number
    dueSoon: number
    overdue: number
    items: {
      id: string
      title: string
      description: string | null
      dueDate: string
      subject: string
      subjectCode: string | null
      teacher: string | null
      submission: { status: string; score: number | null; submittedAt: string; note: string | null } | null
    }[]
  }
  timetableToday: { period: string; startTime: string; endTime: string; subject: string | null; teacher: string | null; isBreak: boolean }[]
  announcements: { id: string; title: string; body: string; publishedAt: string | null; pinned: boolean }[]
}

export async function studentPortalSummary(
  schoolId: string,
  student: StudentWithClass,
  term: { id: string; name: string; startDate: string; endDate: string; session: { name: string } } | null,
): Promise<StudentPortalSummary> {
  const today = isoToday()
  const since = term?.startDate ?? isoDaysFromToday(-120)

  const attendanceWhere = {
    schoolId,
    studentId: student.id,
    periodId: null,
    date: { gte: since, lte: today },
  }

  const [attGroups, card, invoices, homeworkRows, slots, announcements] = await Promise.all([
    db.studentAttendance.groupBy({ by: ['status'], where: attendanceWhere, _count: { _all: true } }),
    db.reportCard.findFirst({
      where: { schoolId, studentId: student.id, published: true, exam: { publishResults: true } },
      orderBy: { generatedAt: 'desc' },
      include: { exam: { select: { name: true } } },
    }),
    db.feeInvoice.findMany({
      where: { schoolId, studentId: student.id, status: { not: 'VOID' } },
      select: { total: true, amountPaid: true, dueDate: true, status: true },
    }),
    student.classId
      ? db.assignment.findMany({
          where: { schoolId, classId: student.classId, dueDate: { gte: isoDaysFromToday(-30) } },
          orderBy: { dueDate: 'desc' },
          take: 30,
          include: {
            subject: { select: { name: true, code: true } },
            teacher: { select: { firstName: true, lastName: true } },
            submissions: { where: { studentId: student.id }, select: { status: true, score: true, submittedAt: true, note: true } },
          },
        })
      : Promise.resolve([]),
    student.classId && term
      ? db.timetableSlot.findMany({
          where: {
            schoolId,
            termId: term.id,
            classId: student.classId,
            day: Math.min(4, Math.max(0, (new Date().getDay() + 6) % 7)),
            OR: [{ sectionId: null }, ...(student.sectionId ? [{ sectionId: student.sectionId }] : [])],
          },
          include: {
            period: { select: { name: true, startTime: true, endTime: true, isBreak: true, order: true } },
            classSubject: { select: { subject: { select: { name: true } } } },
            teacher: { select: { firstName: true, lastName: true } },
          },
          orderBy: { period: { order: 'asc' } },
        })
      : Promise.resolve([]),
    db.announcement.findMany({
      where: {
        schoolId,
        publishedAt: { not: null },
        OR: [
          { audience: 'ALL' },
          { audience: 'PARENTS' },
          { audience: 'STUDENTS' },
          { audience: 'CLASS', classId: student.classId ?? '___' },
        ],
      },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, body: true, publishedAt: true, pinned: true },
    }),
  ])

  // attendance %
  const present = attGroups.find(g => g.status === 'PRESENT')?._count._all ?? 0
  const late = attGroups.find(g => g.status === 'LATE')?._count._all ?? 0
  const absent = attGroups.find(g => g.status === 'ABSENT')?._count._all ?? 0
  const excused = attGroups.find(g => g.status === 'EXCUSED')?._count._all ?? 0
  const counted = present + late + absent
  const pct = counted > 0 ? Math.round(((present + late) / counted) * 100) : 100

  // fees due
  let dueKobo = 0
  let unpaidCount = 0
  let overdueCount = 0
  let nextDueDate: string | null = null
  for (const inv of invoices) {
    const balance = Math.max(0, inv.total - Math.max(0, inv.amountPaid))
    if (balance > 0) {
      dueKobo += balance
      unpaidCount += 1
      if (inv.dueDate < today) overdueCount += 1
      if (!nextDueDate || inv.dueDate < nextDueDate) nextDueDate = inv.dueDate
    }
  }

  // homework roll-up
  let submitted = 0
  let dueSoon = 0
  let overdue = 0
  const soonCutoff = isoDaysFromToday(3)
  const items = homeworkRows.map(a => {
    const sub = a.submissions[0] ?? null
    if (sub) submitted += 1
    else if (a.dueDate < today) overdue += 1
    else if (a.dueDate <= soonCutoff) dueSoon += 1
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      subject: a.subject.name,
      subjectCode: a.subject.code,
      teacher: employeeName(a.teacher),
      submission: sub
        ? { status: sub.status, score: sub.score, submittedAt: sub.submittedAt.toISOString(), note: sub.note }
        : null,
    }
  })

  return {
    id: student.id,
    fullName: fullNameOf(student),
    admissionNumber: student.admissionNumber,
    className: student.class?.name ?? null,
    sectionName: student.section?.name ?? null,
    photoUrl: student.photoUrl,
    attendance: { pct, present, late, absent, total: counted + excused },
    results: card
      ? {
          examName: card.exam.name,
          average: card.average,
          grade: card.grade,
          position: card.position,
        }
      : null,
    fees: { dueKobo, unpaidCount, overdueCount, nextDueDate },
    homework: { submitted, dueSoon, overdue, items },
    timetableToday: slots.map(s => ({
      period: s.period.name,
      startTime: s.period.startTime,
      endTime: s.period.endTime,
      subject: s.classSubject?.subject.name ?? null,
      teacher: employeeName(s.teacher),
      isBreak: s.period.isBreak,
    })),
    announcements,
  }
}
