import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, forbidden } from '@/lib/api/errors'
import { updateFilterSchema } from '@/lib/validation/reports'

async function ownFilter(schoolId: string, userId: string, id: string) {
  const filter = await db.savedFilter.findFirst({ where: { id, schoolId } })
  if (!filter) throw notFound('Saved filter not found')
  if (filter.userId !== userId) throw forbidden('You can only manage your own saved views')
  return filter
}

export const PATCH = createHandler({ permission: 'reports.write', body: updateFilterSchema }, async ({ user, params, body, audit }) => {
  const filter = await ownFilter(user.schoolId, user.id, params.id)
  const updated = await db.savedFilter.update({
    where: { id: filter.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.criteria ? { criteria: JSON.stringify(body.criteria) } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'SavedFilter', entityId: filter.id, summary: `Updated saved view "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'reports.write' }, async ({ user, params, audit }) => {
  const filter = await ownFilter(user.schoolId, user.id, params.id)
  await db.savedFilter.delete({ where: { id: filter.id } })
  audit({ action: 'DELETE', entity: 'SavedFilter', entityId: filter.id, summary: `Deleted saved view "${filter.name}"` })
  return { ok: true }
})
