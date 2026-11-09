import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { applicantCreateSchema } from '@/lib/validation/admissions'
import { applicationNumber } from '@/lib/domain/numbering'

export const GET = createHandler({ permission: 'admissions.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const status = query.get('status')
  if (status) where.status = status
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { applicationNumber: { contains: q.search } },
      { parentName: { contains: q.search } },
    ]
  }

  const [items, total] = await Promise.all([
    db.applicant.findMany({
      where,
      include: { classApplied: { select: { id: true, name: true, level: true } } },
      orderBy: { createdAt: 'desc' },
      skip: q.skip, take: q.take,
    }),
    db.applicant.count({ where }),
  ])
  const counts = await db.applicant.groupBy({ by: ['status'], where: { schoolId: user.schoolId }, _count: { _all: true } })
  return { ...paginated(items, total, q), counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) }
})

export const POST = createHandler({ permission: 'admissions.write', body: applicantCreateSchema }, async ({ user, body, audit }) => {
  const year = new Date().getFullYear()
  const seq = await applicationNumber.currentMax(user.schoolId, year)
  const applicationNumberStr = `APP-${year}-${String(seq + 1).padStart(4, '0')}`

  if (body.classAppliedId) {
    const cls = await db.schoolClass.findFirst({ where: { id: body.classAppliedId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
  }

  const created = await db.applicant.create({ data: {
    schoolId: user.schoolId,
    applicationNumber: applicationNumberStr,
    firstName: body.firstName.trim(), lastName: body.lastName.trim(),
    gender: body.gender, dateOfBirth: body.dateOfBirth ?? null,
    classAppliedId: body.classAppliedId ?? null,
    parentName: body.parentName.trim(), parentPhone: body.parentPhone.trim(),
    parentEmail: body.parentEmail?.trim() || null,
    previousSchool: body.previousSchool?.trim() || null,
    notes: body.notes?.trim() || null,
    status: 'APPLIED',
  } })
  audit({ action: 'CREATE', entity: 'Applicant', entityId: created.id, summary: `Received application ${applicationNumberStr} — ${created.firstName} ${created.lastName}` })
  return { id: created.id, applicationNumber: applicationNumberStr }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
