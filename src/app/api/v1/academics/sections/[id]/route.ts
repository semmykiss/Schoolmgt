import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { sectionUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.write', body: sectionUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Section')
  const section = await db.section.findFirst({ where: { id, schoolId: user.schoolId }, include: { class: true } })
  if (!section) throw notFound('Section not found')

  if (body.name && body.name !== section.name) {
    if (await db.section.findFirst({ where: { classId: section.classId, name: body.name, id: { not: id } } })) {
      throw conflict(`Section "${body.name}" already exists in this class`)
    }
  }
  if (body.formTeacherId) {
    const teacher = await db.employee.findFirst({ where: { id: body.formTeacherId, schoolId: user.schoolId } })
    if (!teacher) throw notFound('Selected form teacher does not exist')
    const alreadyFormTeacher = await db.section.findFirst({
      where: { schoolId: user.schoolId, formTeacherId: body.formTeacherId, id: { not: id } },
      include: { class: { select: { name: true } } },
    })
    if (alreadyFormTeacher) {
      throw conflict(`${teacher.firstName} ${teacher.lastName} is already form teacher of ${alreadyFormTeacher.class.name} ${alreadyFormTeacher.name}`)
    }
  }

  await db.section.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.formTeacherId !== undefined ? { formTeacherId: body.formTeacherId || null } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'Section', entityId: id, summary: `Updated section ${section.class.name} ${section.name}` })
  return { ok: true }
})

export const DELETE = createHandler({ permission: 'academic.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Section')
  const section = await db.section.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!section) throw notFound('Section not found')

  const students = await db.student.count({ where: { sectionId: id, status: 'ACTIVE' } })
  if (students > 0) throw conflict(`Cannot delete section ${section.name} — ${students} active student(s) belong to it`)

  await db.section.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Section', entityId: id, summary: `Deleted section ${section.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
