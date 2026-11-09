import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { classUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.classes.write', body: classUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Class')
  const schoolClass = await db.schoolClass.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!schoolClass) throw notFound('Class not found')

  if (body.name && body.name !== schoolClass.name) {
    if (await db.schoolClass.findFirst({ where: { schoolId: user.schoolId, name: body.name, id: { not: id } } })) {
      throw conflict(`Class "${body.name}" already exists`)
    }
  }

  const updated = await db.schoolClass.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.level !== undefined ? { level: body.level } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'SchoolClass', entityId: id, summary: `Updated class ${updated.name}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'academic.classes.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Class')
  const schoolClass = await db.schoolClass.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!schoolClass) throw notFound('Class not found')

  const [students, applicants] = await Promise.all([
    db.student.count({ where: { classId: id, status: 'ACTIVE' } }),
    db.applicant.count({ where: { classAppliedId: id, status: { in: ['APPLIED', 'INTERVIEW', 'ADMITTED'] } } }),
  ])
  if (students > 0) throw conflict(`Cannot delete "${schoolClass.name}" — ${students} active student(s) are enrolled. Move them first`)
  if (applicants > 0) throw conflict(`Cannot delete "${schoolClass.name}" — ${applicants} applicant(s) applied to it`)

  await db.schoolClass.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'SchoolClass', entityId: id, summary: `Deleted class ${schoolClass.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
