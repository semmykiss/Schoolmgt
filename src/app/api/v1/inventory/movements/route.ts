import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { movementCreateSchema } from '@/lib/validation/inventory'
import { movementError, stockAfter, isLowStock, MOVEMENT_TYPE_LABEL, type MovementType } from '@/lib/domain/inventory'
import { employeeName } from '@/lib/api/portal'
import { notifyUsers, usersWithPermission } from '@/lib/api/notify'

/**
 * GET /inventory/movements — stock card (?itemId=, ?type=, ?from=, ?to=).
 */
export const GET = createHandler({ permission: 'inventory.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const itemId = query.get('itemId')
  if (itemId) where.itemId = itemId
  const type = query.get('type')
  if (type) where.type = type
  const from = query.get('from')
  const to = query.get('to')
  if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        item: { select: { name: true, unit: true } },
        supplier: { select: { name: true } },
      },
      skip: q.skip,
      take: q.take,
    }),
    db.stockMovement.count({ where }),
  ])

  const items = rows.map(m => ({
    ...m,
    itemName: m.item.name,
    unit: m.item.unit,
    supplierName: m.supplier?.name ?? null,
  }))
  return paginated(items, total, q)
})

/**
 * POST /inventory/movements — record a stock movement and apply it atomically.
 *   IN      adds stock (optionally with unit cost + supplier)
 *   OUT     issues stock (rejected when it would go negative)
 *   ADJUST  sets the counted level from a stock-take
 * When an OUT/ADJUST drives stock to/below the reorder level, everyone with
 * `inventory.write` gets a single restock heads-up per crossing.
 */
export const POST = createHandler({ permission: 'inventory.write', body: movementCreateSchema }, async ({ user, body, audit }) => {
  const item = await db.item.findFirst({ where: { id: body.itemId, schoolId: user.schoolId } })
  if (!item) throw notFound('Stock item not found')

  const error = movementError(body.type as MovementType, body.quantity, item.stockQty)
  if (error) throw badRequest(error)

  const nextQty = stockAfter(body.type as MovementType, body.quantity, item.stockQty)

  const result = await db.$transaction(async tx => {
    await tx.item.update({ where: { id: item.id }, data: { stockQty: nextQty } })
    return tx.stockMovement.create({
      data: {
        schoolId: user.schoolId,
        itemId: item.id,
        type: body.type,
        quantity: body.quantity,
        unitCost: body.unitCost ?? null,
        reason: body.reason || null,
        reference: body.reference || null,
        supplierId: body.supplierId || null,
        date: body.date,
        recordedById: user.id,
      },
      include: { item: { select: { name: true, unit: true } }, supplier: { select: { name: true } } },
    })
  })

  // Restock alert: only when crossing from above the reorder level to at/below it.
  let notified = 0
  if (isLowStock(nextQty, item.reorderLevel) && !isLowStock(item.stockQty, item.reorderLevel)) {
    const watchers = await usersWithPermission(user.schoolId, 'inventory.write')
    await notifyUsers(user.schoolId, watchers, {
      title: `Low stock — ${item.name}`,
      body: `${MOVEMENT_TYPE_LABEL[body.type]} recorded: ${nextQty} ${item.unit} left (reorder level ${item.reorderLevel}). Time to restock.`,
      type: 'SYSTEM',
      link: '#/inventory',
    })
    notified = watchers.length
  }

  audit({
    action: 'create',
    entity: 'StockMovement',
    entityId: result.id,
    summary: `${MOVEMENT_TYPE_LABEL[body.type]} — ${item.name} ${body.type === 'ADJUST' ? `set to ${body.quantity}` : `${body.type === 'IN' ? '+' : '−'}${body.quantity}`} ${item.unit} (now ${nextQty})`,
  })
  return {
    ...result,
    itemName: result.item.name,
    stockQty: nextQty,
    lowStock: isLowStock(nextQty, item.reorderLevel),
    notified,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
