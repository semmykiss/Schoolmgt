import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { feeStructureCreateSchema } from '@/lib/validation/fees'
import { subtotalOf } from '@/lib/domain/fees'

export const GET = createHandler({ permission: 'fees.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const classId = query.get('classId')
  const termId = query.get('termId')
  const sessionId = query.get('sessionId')
  if (classId) where.classId = classId
  if (termId) where.termId = termId
  if (sessionId) where.sessionId = sessionId
  if (q.search) where.name = { contains: q.search }

  const [items, total] = await Promise.all([
    db.feeStructure.findMany({
      where,
      include: { class: { select: { id: true, name: true, level: true } } },
      orderBy: [{ createdAt: 'desc' }],
      skip: q.skip, take: q.take,
    }),
    db.feeStructure.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'fees.write', body: feeStructureCreateSchema }, async ({ user, body, audit }) => {
  const [cls, term] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId }, select: { id: true } }),
    db.term.findFirst({ where: { id: body.termId, schoolId: user.schoolId }, select: { id: true, sessionId: true } }),
  ])
  if (!cls) throw notFound('Selected class does not exist')
  if (!term) throw notFound('Selected term does not exist')
  if (term.sessionId !== body.sessionId) throw badRequest('Selected term does not belong to that session')

  const exists = await db.feeStructure.findFirst({ where: { schoolId: user.schoolId, name: body.name }, select: { id: true } })
  if (exists) throw badRequest('A fee structure with that name already exists')

  const created = await db.feeStructure.create({ data: {
    schoolId: user.schoolId,
    name: body.name.trim(),
    classId: body.classId,
    termId: body.termId,
    sessionId: body.sessionId,
    items: JSON.stringify(body.items),
    totalAmount: subtotalOf(body.items),
    isActive: body.isActive,
  } })
  audit({ action: 'CREATE', entity: 'FeeStructure', entityId: created.id, summary: `Created fee structure "${created.name}"` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
