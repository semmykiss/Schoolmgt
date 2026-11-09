import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { supplierUpdateSchema } from '@/lib/validation/inventory'

/** PATCH /inventory/suppliers/:id */
export const PATCH = createHandler({ permission: 'inventory.write', body: supplierUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Supplier')
  const supplier = await db.supplier.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!supplier) throw notFound('Supplier not found')

  const updated = await db.supplier.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName || null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.email !== undefined ? { email: body.email || null } : {}),
      ...(body.address !== undefined ? { address: body.address || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    },
  })
  audit({ action: 'update', entity: 'Supplier', entityId: id, summary: `Updated supplier "${updated.name}"` })
  return updated
})

/** DELETE /inventory/suppliers/:id */
export const DELETE = createHandler({ permission: 'inventory.write' }, async ({ user, params, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Supplier')
  const supplier = await db.supplier.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!supplier) throw notFound('Supplier not found')

  await db.supplier.delete({ where: { id } })
  audit({ action: 'delete', entity: 'Supplier', entityId: id, summary: `Deleted supplier "${supplier.name}"` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
