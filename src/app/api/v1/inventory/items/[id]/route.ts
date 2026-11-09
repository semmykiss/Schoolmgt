import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { itemUpdateSchema } from '@/lib/validation/inventory'

/** PATCH /inventory/items/:id — edit catalogue details (name, price, reorder level…). */
export const PATCH = createHandler({ permission: 'inventory.write', body: itemUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Item')
  const item = await db.item.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!item) throw notFound('Stock item not found')

  const updated = await db.item.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.sku !== undefined ? { sku: body.sku || null } : {}),
      ...(body.category !== undefined ? { category: body.category || null } : {}),
      ...(body.unit !== undefined ? { unit: body.unit } : {}),
      ...(body.reorderLevel !== undefined ? { reorderLevel: body.reorderLevel } : {}),
      ...(body.unitPrice !== undefined ? { unitPrice: body.unitPrice ?? null } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
    },
  })
  audit({ action: 'update', entity: 'Item', entityId: id, summary: `Updated stock item "${updated.name}"` })
  return updated
})

/** DELETE /inventory/items/:id — remove an item and its movement history. */
export const DELETE = createHandler({ permission: 'inventory.write' }, async ({ user, params, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Item')
  const item = await db.item.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!item) throw notFound('Stock item not found')

  await db.item.delete({ where: { id } })
  audit({ action: 'delete', entity: 'Item', entityId: id, summary: `Deleted stock item "${item.name}"` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
