import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { assertAssignmentManageable, assertPortalStudentAccess, isoToday } from '@/lib/api/portal'
import { submissionCreateSchema, submissionGradeSchema } from '@/lib/validation/assignments'

async function getOwnedAssignment(schoolId: string, id: string) {
  const assignment = await db.assignment.findFirst({ where: { id, schoolId } })
  if (!assignment) throw notFound('Homework not found')
  return assignment
}

function composeName(s: { firstName: string; lastName: string; otherName?: string | null }): string {
  return [s.firstName, s.lastName, s.otherName].filter(Boolean).join(' ')
}

/**
 * GET — staff roster view: every active student in the class joined with their
 * submission state (submitted / late / graded / missing).
 */
export const GET = createHandler({ permission: 'assignments.read' }, async ({ user, params }) => {
  const assignment = await getOwnedAssignment(user.schoolId, params.id)

  const [students, submissions] = await Promise.all([
    db.student.findMany({
      where: { schoolId: user.schoolId, classId: assignment.classId, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, firstName: true, lastName: true, otherName: true, admissionNumber: true,
        section: { select: { name: true } },
      },
    }),
    db.assignmentSubmission.findMany({
      where: { assignmentId: assignment.id },
      select: { id: true, studentId: true, status: true, score: true, submittedAt: true, note: true, fileUrl: true },
    }),
  ])
  const byStudent = new Map(submissions.map(s => [s.studentId, s]))

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      dueDate: assignment.dueDate,
      subjectId: assignment.subjectId,
    },
    items: students.map(s => {
      const sub = byStudent.get(s.id) ?? null
      return {
        studentId: s.id,
        fullName: composeName(s),
        admissionNumber: s.admissionNumber,
        section: s.section?.name ?? null,
        submission: sub
          ? {
              id: sub.id,
              status: sub.status,
              score: sub.score,
              submittedAt: sub.submittedAt.toISOString(),
              note: sub.note,
              fileUrl: sub.fileUrl,
            }
          : null,
      }
    }),
  }
})

/**
 * POST — student/parent turn-in (idempotent upsert; resubmission allowed until graded).
 * LATE is derived from the due date at submission time.
 */
export const POST = createHandler(
  { permission: 'portal', roles: ['STUDENT', 'PARENT'], body: submissionCreateSchema },
  async ({ user, params, body, audit }) => {
    const assignment = await getOwnedAssignment(user.schoolId, params.id)
    const student = await assertPortalStudentAccess(user, body.studentId ?? null)
    if (student.classId !== assignment.classId) {
      throw badRequest('This homework was not posted for your class')
    }

    const existing = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
    })
    if (existing?.status === 'GRADED') {
      throw badRequest('This homework has already been graded — ask your teacher to reopen it')
    }

    const status = assignment.dueDate < isoToday() ? 'LATE' : 'SUBMITTED'
    const submission = await db.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
      create: {
        assignmentId: assignment.id,
        studentId: student.id,
        status,
        note: body.note || null,
        fileUrl: body.fileUrl || null,
      },
      update: {
        status,
        note: body.note === undefined ? undefined : (body.note || null),
        fileUrl: body.fileUrl === undefined ? undefined : (body.fileUrl || null),
        submittedAt: new Date(),
      },
    })

    // Notify the posting teacher (when they have a portal login)
    if (assignment.teacherId) {
      const teacher = await db.employee.findFirst({
        where: { id: assignment.teacherId, userId: { not: null } },
        select: { userId: true },
      })
      if (teacher?.userId) {
        await db.notification.create({
          data: {
            schoolId: user.schoolId,
            userId: teacher.userId,
            title: 'Homework submitted',
            body: `${student.fullName} turned in "${assignment.title}".`,
            type: 'SYSTEM',
            link: '#/homework',
          },
        })
      }
    }

    audit({
      action: 'create',
      entity: 'assignmentSubmission',
      entityId: submission.id,
      summary: `${student.fullName} submitted "${assignment.title}" (${status})`,
    })
    return {
      id: submission.id,
      status: submission.status,
      score: submission.score,
      submittedAt: submission.submittedAt.toISOString(),
      note: submission.note,
    }
  },
)

/**
 * PATCH — teacher/admin grades a submission (score → status GRADED; parent/student notified).
 */
export const PATCH = createHandler(
  { permission: 'assignments.grade', body: submissionGradeSchema },
  async ({ user, params, body, audit }) => {
    const assignment = await getOwnedAssignment(user.schoolId, params.id)
    await assertAssignmentManageable(user, assignment)

    const student = await db.student.findFirst({
      where: { id: body.studentId, schoolId: user.schoolId },
      select: { id: true, firstName: true, lastName: true, userId: true, guardians: { select: { guardian: { select: { userId: true } } } } },
    })
    if (!student) throw notFound('Student not found')

    const submission = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
    })
    if (!submission) throw notFound('This student has not submitted yet')

    const nextStatus = body.status ?? (body.score != null ? 'GRADED' : submission.status)
    const updated = await db.assignmentSubmission.update({
      where: { id: submission.id },
      data: { score: body.score ?? undefined, status: nextStatus },
    })

    // Notify student + portal-linked guardians about the grade
    const userIds = new Set<string>()
    if (student.userId) userIds.add(student.userId)
    for (const g of student.guardians) if (g.guardian.userId) userIds.add(g.guardian.userId)
    if (userIds.size > 0 && updated.status === 'GRADED') {
      await db.notification.createMany({
        data: [...userIds].map(userId => ({
          schoolId: user.schoolId,
          userId,
          title: 'Homework graded',
          body: `${assignment.title}: scored ${updated.score ?? '—'}.`,
          type: 'RESULT',
          link: '#/portal',
        })),
      })
    }

    audit({
      action: 'update',
      entity: 'assignmentSubmission',
      entityId: updated.id,
      summary: `Graded "${assignment.title}" for ${composeName(student)} — ${updated.score ?? 'no score'}`,
    })
    return { id: updated.id, status: updated.status, score: updated.score }
  },
)
