import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { studentCreateSchema } from '@/lib/validation/admissions'
import { admissionNumber, schoolPrefix } from '@/lib/domain/numbering'

export const GET = createHandler({ permission: 'students.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const classId = query.get('classId')
  const sectionId = query.get('sectionId')
  const status = query.get('status')
  const gender = query.get('gender')
  if (classId) where.classId = classId
  if (sectionId) where.sectionId = sectionId
  if (status) where.status = status
  if (gender) where.gender = gender
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { otherName: { contains: q.search } },
      { admissionNumber: { contains: q.search } },
    ]
  }

  const [items, total] = await Promise.all([
    db.student.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, level: true } },
        section: { select: { id: true, name: true } },
        _count: { select: { guardians: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: q.skip, take: q.take,
    }),
    db.student.count({ where }),
  ])
  const counts = await db.student.groupBy({ by: ['status'], where: { schoolId: user.schoolId }, _count: { _all: true } })
  return { ...paginated(items, total, q), counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) }
})

export const POST = createHandler({ permission: 'students.write', body: studentCreateSchema }, async ({ user, body, audit }) => {
  if (body.classId) {
    const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
    if (body.sectionId) {
      const section = await db.section.findFirst({ where: { id: body.sectionId, classId: body.classId, schoolId: user.schoolId } })
      if (!section) throw badRequest('Selected section does not belong to that class')
    }
  } else if (body.sectionId) {
    throw badRequest('Pick a class before choosing a section')
  }

  const year = new Date().getFullYear()
  const school = await db.school.findUnique({ where: { id: user.schoolId }, select: { name: true } })
  const seq = await admissionNumber.currentMax(user.schoolId, year)
  const admissionNumberStr = `${schoolPrefix(school?.name ?? 'SchoolDesk')}/${year}/${String(seq + 1).padStart(4, '0')}`

  const created = await db.student.create({ data: {
    schoolId: user.schoolId, branchId: body.branchId ?? null,
    admissionNumber: admissionNumberStr,
    firstName: body.firstName.trim(), lastName: body.lastName.trim(),
    otherName: body.otherName?.trim() || null,
    gender: body.gender, dateOfBirth: body.dateOfBirth ?? null,
    classId: body.classId ?? null, sectionId: body.sectionId ?? null,
    admissionDate: body.admissionDate, status: 'ACTIVE',
    address: body.address?.trim() || null,
    bloodGroup: body.bloodGroup?.trim() || null,
    medicalNotes: body.medicalNotes?.trim() || null,
  } })
  audit({ action: 'CREATE', entity: 'Student', entityId: created.id, summary: `Enrolled ${created.firstName} ${created.lastName} (${admissionNumberStr})` })
  return { id: created.id, admissionNumber: admissionNumberStr }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
