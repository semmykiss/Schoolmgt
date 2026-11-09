import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { employeeOfUser, portalStudentsFor, employeeName } from '@/lib/api/portal'

/**
 * GET /assignments/portal — role-aware homework list:
 *  STUDENT  → assignments for their class + own submission state
 *  PARENT   → one row per child assignment + per-child submission state
 *  TEACHER  → homework they posted, with submission progress
 *  others   → school-wide list (staff view)
 */
export const GET = createHandler({ permission: 'portal' }, async ({ user }) => {
  const schoolId = user.schoolId

  // ── Portal actors: parent / student ───────────────────────────────────────
  if (user.role === 'STUDENT' || user.role === 'PARENT') {
    const students = await portalStudentsFor(user)
    const rows: unknown[] = []

    for (const student of students) {
      if (!student.classId) continue
      const assignments = await db.assignment.findMany({
        where: { schoolId, classId: student.classId, dueDate: { gte: isoDaysBack(30) } },
        orderBy: { dueDate: 'asc' },
        take: 50,
        include: {
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { firstName: true, lastName: true } },
          submissions: {
            where: { studentId: student.id },
            select: { id: true, status: true, score: true, submittedAt: true, note: true },
          },
        },
      })
      for (const a of assignments) {
        const sub = a.submissions[0] ?? null
        rows.push({
          id: a.id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          createdAt: a.createdAt,
          class: { id: student.classId, name: student.class?.name ?? null },
          subject: a.subject,
          teacher: employeeName(a.teacher),
          student: { id: student.id, fullName: [student.firstName, student.lastName].filter(Boolean).join(' ') },
          submission: sub
            ? { id: sub.id, status: sub.status, score: sub.score, submittedAt: sub.submittedAt.toISOString(), note: sub.note }
            : null,
        })
      }
    }
    // newest due first across children
    rows.sort((a, b) => String((b as { dueDate: string }).dueDate).localeCompare(String((a as { dueDate: string }).dueDate)))
    return { items: rows }
  }

  // ── Staff views ───────────────────────────────────────────────────────────
  const where: Record<string, unknown> = { schoolId }
  if (user.role === 'TEACHER') {
    const emp = await employeeOfUser(schoolId, user.id)
    if (emp) where.teacherId = emp.id
  }
  const items = await db.assignment.findMany({
    where,
    orderBy: { dueDate: 'desc' },
    take: 50,
    include: {
      class: {
        select: {
          id: true, name: true,
          _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        },
      },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { firstName: true, lastName: true } },
      _count: { select: { submissions: true } },
    },
  })
  return {
    items: items.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      class: { id: a.class.id, name: a.class.name },
      subject: a.subject,
      teacher: employeeName(a.teacher),
      rosterCount: a.class._count.students,
      submissionCount: a._count.submissions,
    })),
  }
})

function isoDaysBack(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
