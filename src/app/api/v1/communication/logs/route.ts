import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const channel = query.get('channel')
  const status = query.get('status')
  if (channel) where.channel = channel
  if (status) where.status = status
  if (q.search) where.recipient = { contains: q.search }

  const [items, total, counts] = await Promise.all([
    db.communicationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
    }),
    db.communicationLog.count({ where }),
    db.communicationLog.groupBy({
      by: ['status'],
      where: { schoolId: user.schoolId },
      _count: { _all: true },
    }),
  ])
  const statusCounts: Record<string, number> = {}
  for (const c of counts) statusCounts[c.status] = c._count._all
  return { ...paginated(items, total, q), statusCounts }
})
