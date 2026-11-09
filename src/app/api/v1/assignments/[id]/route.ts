import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { assertAssignmentManageable, employeeName } from '@/lib/api/portal'
import { assignmentUpdateSchema } from '@/lib/validation/assignments'

async function getAssignment(schoolId: string, id: string) {
  const assignment = await db.assignment.findFirst({
    where: { id, schoolId },
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { submissions: true } },
    },
  })
  if (!assignment) throw notFound('Homework not found')
  return {
    ...assignment,
    teacher: assignment.teacher ? { id: assignment.teacher.id, fullName: employeeName(assignment.teacher) } : null,
  }
}

export const GET = createHandler({ permission: 'assignments.read' }, async ({ user, params }) => {
  return getAssignment(user.schoolId, params.id)
})

export const PATCH = createHandler({ permission: 'assignments.write', body: assignmentUpdateSchema }, async ({ user, params, body, audit }) => {
  const assignment = await getAssignment(user.schoolId, params.id)
  await assertAssignmentManageable(user, assignment)

  if (body.classId) {
    const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
  }
  if (body.subjectId) {
    const subject = await db.subject.findFirst({ where: { id: body.subjectId, schoolId: user.schoolId } })
    if (!subject) throw notFound('Selected subject does not exist')
  }

  const updated = await db.assignment.update({
    where: { id: assignment.id },
    data: {
      classId: body.classId ?? undefined,
      subjectId: body.subjectId ?? undefined,
      teacherId: body.teacherId === undefined ? undefined : body.teacherId,
      title: body.title ?? undefined,
      description: body.description === undefined ? undefined : (body.description || null),
      dueDate: body.dueDate ?? undefined,
    },
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { submissions: true } },
    },
  })
  audit({ action: 'update', entity: 'assignment', entityId: updated.id, summary: `Updated homework "${updated.title}"` })
  return {
    ...updated,
    teacher: updated.teacher ? { id: updated.teacher.id, fullName: employeeName(updated.teacher) } : null,
  }
})

export const DELETE = createHandler({ permission: 'assignments.write' }, async ({ user, params, audit }) => {
  const assignment = await getAssignment(user.schoolId, params.id)
  await assertAssignmentManageable(user, assignment)
  await db.assignment.delete({ where: { id: assignment.id } })
  audit({ action: 'delete', entity: 'assignment', entityId: assignment.id, summary: `Deleted homework "${assignment.title}"` })
  return { ok: true }
})
