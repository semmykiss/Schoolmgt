import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { discountCreateSchema } from '@/lib/validation/fees'

export const GET = createHandler({ permission: 'fees.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const studentId = query.get('studentId')
  const active = query.get('active')
  if (studentId) where.studentId = studentId
  if (active === 'true') where.active = true
  if (q.search) where.OR = [{ name: { contains: q.search } }]

  const [items, total] = await Promise.all([
    db.discount.findMany({
      where,
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
      orderBy: [{ createdAt: 'desc' }],
      skip: q.skip, take: q.take,
    }),
    db.discount.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'fees.discounts.write', body: discountCreateSchema }, async ({ user, body, audit }) => {
  const student = await db.student.findFirst({ where: { id: body.studentId, schoolId: user.schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!student) throw notFound('Selected student does not exist')

  const created = await db.discount.create({ data: {
    schoolId: user.schoolId,
    studentId: body.studentId,
    name: body.name.trim(),
    type: body.type,
    value: body.value,
    sessionId: body.sessionId ?? null,
    active: body.active,
  } })
  audit({ action: 'CREATE', entity: 'Discount', entityId: created.id, summary: `Granted "${created.name}" to ${student.firstName} ${student.lastName}` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
