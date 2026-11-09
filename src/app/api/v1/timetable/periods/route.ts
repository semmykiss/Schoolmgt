import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { periodCreateSchema } from '@/lib/validation/timetable'

export const GET = createHandler({ permission: 'timetable.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) where.name = { contains: q.search }

  const [items, total] = await Promise.all([
    db.period.findMany({
      where,
      include: { _count: { select: { slots: true } } },
      orderBy: { order: 'asc' },
      skip: q.skip, take: q.take,
    }),
    db.period.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'timetable.write', body: periodCreateSchema }, async ({ user, body, audit }) => {
  const name = body.name.trim()
  if (await db.period.findFirst({ where: { schoolId: user.schoolId, name } })) {
    throw conflict(`A period named "${name}" already exists`)
  }
  const created = await db.period.create({ data: {
    schoolId: user.schoolId, name,
    startTime: body.startTime, endTime: body.endTime,
    order: body.order, isBreak: body.isBreak,
  } })
  audit({ action: 'CREATE', entity: 'Period', entityId: created.id, summary: `Created period ${name} (${body.startTime}–${body.endTime})` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
