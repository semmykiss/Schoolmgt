import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { sectionCreateSchema } from '@/lib/validation/academic'

export const POST = createHandler({ permission: 'academic.classes.write', body: sectionCreateSchema }, async ({ user, body, audit }) => {
  const schoolClass = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
  if (!schoolClass) throw notFound('Class not found')
  const name = body.name.trim()

  if (await db.section.findFirst({ where: { classId: body.classId, name } })) {
    throw conflict(`Section "${name}" already exists in ${schoolClass.name}`)
  }
  if (body.formTeacherId) {
    const teacher = await db.employee.findFirst({ where: { id: body.formTeacherId, schoolId: user.schoolId } })
    if (!teacher) throw notFound('Selected form teacher does not exist')
    const alreadyFormTeacher = await db.section.findFirst({
      where: { schoolId: user.schoolId, formTeacherId: body.formTeacherId, classId: { not: body.classId } },
      include: { class: { select: { name: true } } },
    })
    if (alreadyFormTeacher) {
      throw conflict(`${teacher.firstName} ${teacher.lastName} is already form teacher of ${alreadyFormTeacher.class.name} ${alreadyFormTeacher.name}`)
    }
  }

  const created = await db.section.create({ data: {
    schoolId: user.schoolId, classId: body.classId, name,
    capacity: body.capacity, formTeacherId: body.formTeacherId ?? null,
  } })
  audit({ action: 'CREATE', entity: 'Section', entityId: created.id, summary: `Created section ${schoolClass.name} ${name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
