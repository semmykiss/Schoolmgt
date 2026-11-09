import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { discountUpdateSchema } from '@/lib/validation/fees'

export const PATCH = createHandler({ permission: 'fees.discounts.write', body: discountUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = params.id
  const existing = await db.discount.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Discount not found')
  if ((body.type ?? existing.type) === 'PERCENT' && (body.value ?? existing.value) > 100) {
    throw badRequest('Percentage cannot exceed 100')
  }

  const updated = await db.discount.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      type: body.type,
      value: body.value,
      sessionId: body.sessionId,
      active: body.active,
    },
  })
  audit({ action: 'UPDATE', entity: 'Discount', entityId: id, summary: `Updated discount "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'fees.discounts.write' }, async ({ user, params, audit }) => {
  const id = params.id
  const existing = await db.discount.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Discount not found')
  await db.discount.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Discount', entityId: id, summary: `Deleted discount "${existing.name}"` })
  return { deleted: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
