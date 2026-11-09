import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { subjectUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.subjects.write', body: subjectUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Subject')
  const subject = await db.subject.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!subject) throw notFound('Subject not found')

  if (body.name && body.name !== subject.name) {
    if (await db.subject.findFirst({ where: { schoolId: user.schoolId, name: body.name, id: { not: id } } })) {
      throw conflict(`Subject "${body.name}" already exists`)
    }
  }

  const updated = await db.subject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.code !== undefined ? { code: body.code.trim() || null } : {}),
      ...(body.isCore !== undefined ? { isCore: body.isCore } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'Subject', entityId: id, summary: `Updated subject ${updated.name}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'academic.subjects.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Subject')
  const subject = await db.subject.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!subject) throw notFound('Subject not found')

  const assignments = await db.classSubject.count({ where: { subjectId: id } })
  if (assignments > 0) {
    throw conflict(`Cannot delete "${subject.name}" — it is taught in ${assignments} class(es). Remove the assignments first`)
  }

  await db.subject.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Subject', entityId: id, summary: `Deleted subject ${subject.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
