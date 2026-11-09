import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { classSubjectCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const classId = query.get('classId') ?? undefined
  const teacherId = query.get('teacherId') ?? undefined
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (classId) where.classId = classId
  if (teacherId) where.teacherId = teacherId

  const items = await db.classSubject.findMany({
    where,
    include: {
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, name: true, code: true, isCore: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, staffCode: true } },
      _count: { select: { lessonPlans: true } },
    },
    orderBy: [{ class: { level: 'asc' } }, { subject: { name: 'asc' } }],
  })
  return {
    items: items.map(cs => ({
      ...cs,
      teacher: cs.teacher
        ? { id: cs.teacher.id, fullName: `${cs.teacher.firstName} ${cs.teacher.lastName}`, staffCode: cs.teacher.staffCode }
        : null,
    })),
  }
})

export const POST = createHandler({ permission: 'academic.subjects.write', body: classSubjectCreateSchema }, async ({ user, body, audit }) => {
  const [schoolClass, subject] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } }),
    db.subject.findFirst({ where: { id: body.subjectId, schoolId: user.schoolId } }),
  ])
  if (!schoolClass) throw notFound('Class not found')
  if (!subject) throw notFound('Subject not found')

  if (await db.classSubject.findFirst({ where: { classId: body.classId, subjectId: body.subjectId } })) {
    throw conflict(`${subject.name} is already offered in ${schoolClass.name}`)
  }
  if (body.teacherId) {
    const teacher = await db.employee.findFirst({ where: { id: body.teacherId, schoolId: user.schoolId } })
    if (!teacher) throw notFound('Selected teacher does not exist')
  }

  const created = await db.classSubject.create({ data: {
    schoolId: user.schoolId, classId: body.classId, subjectId: body.subjectId,
    teacherId: body.teacherId ?? null,
  } })
  audit({ action: 'CREATE', entity: 'ClassSubject', entityId: created.id, summary: `Added ${subject.name} to ${schoolClass.name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
