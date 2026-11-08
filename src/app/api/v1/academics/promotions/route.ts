import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { promotionRunSchema } from '@/lib/validation/academic'
import { planPromotions, validatePromotionEntries, type PromoClass, type PromoStudent } from '@/lib/domain/promotion'

/** Preview: list students of ?classId with their suggested promotion targets. */
export const GET = createHandler({ permission: 'students.read' }, async ({ user, params, query }) => {
  const classId = requireId(query.get('classId') ?? undefined, 'Class')
  const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId: user.schoolId } })
  if (!schoolClass) throw notFound('Class not found')

  const [students, allClasses] = await Promise.all([
    db.student.findMany({
      where: { schoolId: user.schoolId, classId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, otherName: true, admissionNumber: true, status: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    db.schoolClass.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, level: true }, orderBy: { level: 'asc' } }),
  ])

  const promoStudents: PromoStudent[] = students.map(s => ({
    id: s.id,
    fullName: [s.lastName, s.firstName, s.otherName].filter(Boolean).join(' '),
    admissionNumber: s.admissionNumber,
    classId,
    classLevel: schoolClass.level,
    status: s.status,
  }))
  const promoClasses: PromoClass[] = allClasses

  const { plan, targetClasses, warnings } = planPromotions(promoStudents, promoClasses)
  const gradated = await db.student.count({ where: { schoolId: user.schoolId, classId, status: { not: 'ACTIVE' } } })
  return { className: schoolClass.name, plan, targetClasses, warnings, inactiveCount: gradated }
})

/** Execute: apply the edited plan (promote / hold back / graduate). */
export const POST = createHandler({ permission: 'students.write', body: promotionRunSchema }, async ({ user, body, audit }) => {
  const ids = body.entries.map(e => e.studentId)
  const students = await db.student.findMany({
    where: { id: { in: ids }, schoolId: user.schoolId },
    select: { id: true, firstName: true, lastName: true, otherName: true, admissionNumber: true, classId: true, status: true },
  })
  if (students.length !== ids.length) throw badRequest('Some students no longer exist in this school')

  const allClasses = await db.schoolClass.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, level: true } })
  const promoStudents: PromoStudent[] = students.map(s => ({
    id: s.id,
    fullName: [s.lastName, s.firstName, s.otherName].filter(Boolean).join(' '),
    admissionNumber: s.admissionNumber,
    classId: s.classId, classLevel: allClasses.find(c => c.id === s.classId)?.level ?? null,
    status: s.status,
  }))
  const { plan } = planPromotions(promoStudents, allClasses as PromoClass[])

  const entryErrors = validatePromotionEntries(body.entries, plan)
  if (entryErrors.length) {
    throw badRequest('Some promotion entries are invalid', entryErrors)
  }

  const classIds = body.entries.map(e => e.toClassId).filter(Boolean) as string[]
  for (const cid of classIds) {
    if (!allClasses.some(c => c.id === cid)) throw badRequest('One of the target classes does not exist')
  }

  let promoted = 0, held = 0, graduated = 0
  await db.$transaction(async tx => {
    for (const e of body.entries) {
      if (e.action === 'PROMOTE') {
        await tx.student.update({
          where: { id: e.studentId },
          data: { classId: e.toClassId!, sectionId: e.toSectionId ?? null },
        })
        promoted++
      } else if (e.action === 'GRADUATE') {
        await tx.student.update({
          where: { id: e.studentId },
          data: { status: 'GRADUATED', exitDate: new Date().toISOString().slice(0, 10), exitReason: 'Graduated — completed final class' },
        })
        graduated++
      } else {
        held++
      }
    }
  })

  audit({
    action: 'UPDATE', entity: 'Student',
    summary: `Promotion run: ${promoted} promoted, ${held} held back, ${graduated} graduated`,
  })
  return { promoted, held, graduated }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
