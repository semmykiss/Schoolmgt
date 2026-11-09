import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { supplierCreateSchema } from '@/lib/validation/inventory'

/**
 * GET /inventory/suppliers — supplier directory with search.
 */
export const GET = createHandler({ permission: 'inventory.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) where.name = { contains: q.search }

  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.supplier.count({ where }),
  ])
  return paginated(rows, total, q)
})

/** POST /inventory/suppliers — add a supplier. */
export const POST = createHandler({ permission: 'inventory.write', body: supplierCreateSchema }, async ({ user, body, audit }) => {
  const exists = await db.supplier.findFirst({ where: { schoolId: user.schoolId, name: body.name } })
  if (exists) throw conflict(`A supplier named "${body.name}" already exists`)

  const created = await db.supplier.create({
    data: {
      schoolId: user.schoolId,
      name: body.name,
      contactName: body.contactName || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  })
  audit({ action: 'create', entity: 'Supplier', entityId: created.id, summary: `Added supplier "${created.name}"` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
