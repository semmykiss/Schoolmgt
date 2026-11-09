import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { itemCreateSchema } from '@/lib/validation/inventory'
import { isLowStock } from '@/lib/domain/inventory'

/**
 * GET /inventory/items — stock catalogue with search (?search=), category
 * (?category=) and a lowStock=1 filter for re-ordering. Readable by everyone
 * with inventory.read (admin, principal, librarian, HR…).
 */
export const GET = createHandler({ permission: 'inventory.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) where.name = { contains: q.search }
  const category = query.get('category')
  if (category) where.category = category

  const [rows, total, allMatching] = await Promise.all([
    db.item.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.item.count({ where }),
    db.item.findMany({ where, select: { stockQty: true, reorderLevel: true, unitPrice: true } }),
  ])

  const items = rows.map(r => ({ ...r, lowStock: isLowStock(r.stockQty, r.reorderLevel) }))
  const stats = {
    total: allMatching.length,
    lowStock: allMatching.filter(i => isLowStock(i.stockQty, i.reorderLevel)).length,
    stockValue: allMatching.reduce((t, i) => t + (i.unitPrice ? i.stockQty * i.unitPrice : 0), 0),
  }
  return { ...paginated(items, total, q), stats }
})

/** POST /inventory/items — register a new stock item. */
export const POST = createHandler({ permission: 'inventory.write', body: itemCreateSchema }, async ({ user, body, audit }) => {
  const created = await db.item.create({
    data: {
      schoolId: user.schoolId,
      name: body.name,
      sku: body.sku || null,
      category: body.category || null,
      unit: body.unit || 'pcs',
      reorderLevel: body.reorderLevel ?? 5,
      unitPrice: body.unitPrice ?? null,
      description: body.description || null,
    },
  })
  audit({ action: 'create', entity: 'Item', entityId: created.id, summary: `Added stock item "${created.name}"` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
