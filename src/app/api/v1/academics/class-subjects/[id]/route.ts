import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { classSubjectUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.subjects.write', body: classSubjectUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Assignment')
  const classSubject = await db.classSubject.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { subject: true, class: true },
  })
  if (!classSubject) throw notFound('Assignment not found')

  if (body.teacherId) {
    const teacher = await db.employee.findFirst({ where: { id: body.teacherId, schoolId: user.schoolId } })
    if (!teacher) throw notFound('Selected teacher does not exist')
  }

  await db.classSubject.update({ where: { id }, data: { teacherId: body.teacherId || null } })
  audit({
    action: 'UPDATE', entity: 'ClassSubject', entityId: id,
    summary: body.teacherId
      ? `Assigned a teacher to ${classSubject.subject.name} (${classSubject.class.name})`
      : `Cleared teacher for ${classSubject.subject.name} (${classSubject.class.name})`,
  })
  return { ok: true }
})

export const DELETE = createHandler({ permission: 'academic.subjects.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Assignment')
  const classSubject = await db.classSubject.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { subject: true, class: true },
  })
  if (!classSubject) throw notFound('Assignment not found')

  const results = await db.examResult.count({ where: { classSubjectId: id } })
  if (results > 0) {
    throw conflict(`Cannot remove ${classSubject.subject.name} from ${classSubject.class.name} — ${results} exam result(s) are recorded`)
  }

  await db.classSubject.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'ClassSubject', entityId: id, summary: `Removed ${classSubject.subject.name} from ${classSubject.class.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
