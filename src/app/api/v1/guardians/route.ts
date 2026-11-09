import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'

/** Guardian picker (search by name/phone) used when linking guardians to students. */
export const GET = createHandler({ permission: 'students.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 20 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { phone: { contains: q.search } },
    ]
  }
  const [items, total] = await Promise.all([
    db.guardian.findMany({
      where,
      include: { _count: { select: { students: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: q.skip, take: q.take,
    }),
    db.guardian.count({ where }),
  ])
  return paginated(items, total, q)
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
