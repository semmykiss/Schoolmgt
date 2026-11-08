import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'

/**
 * Lightweight staff list used by pickers (form teacher, subject teacher).
 * The full HR module (Phase 8) extends this endpoint with filters + CRUD.
 */
export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 200 })
  const where: Record<string, unknown> = { schoolId: user.schoolId, status: 'ACTIVE' }
  if (q.search) {
    where.OR = [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }, { staffCode: { contains: q.search } }]
  }
  const department = query.get('department')
  if (department) where.department = department

  const [items, total] = await Promise.all([
    db.employee.findMany({
      where,
      select: { id: true, staffCode: true, firstName: true, lastName: true, position: true, department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: q.skip, take: q.take,
    }),
    db.employee.count({ where }),
  ])
  return paginated(items.map(e => ({ ...e, fullName: `${e.firstName} ${e.lastName}` })), total, q)
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
