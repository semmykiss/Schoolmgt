import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { scheduledExportUpdateSchema } from '@/lib/validation/reports'

export const PATCH = createHandler({ permission: 'reports.write', body: scheduledExportUpdateSchema }, async ({ user, params, body, audit }) => {
  const existing = await db.scheduledExport.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Scheduled export not found')

  const updated = await db.scheduledExport.update({
    where: { id: existing.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.frequency ? { frequency: body.frequency } : {}),
      ...(body.format ? { format: body.format } : {}),
      ...(body.reportKey ? { reportKey: body.reportKey } : {}),
      ...(body.recipients ? { recipients: JSON.stringify(body.recipients) } : {}),
      ...(body.filters ? { filters: JSON.stringify(body.filters) } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'ScheduledExport', entityId: existing.id, summary: `Updated scheduled export "${updated.name}"` })
  return { ...updated, recipients: JSON.parse(updated.recipients) as string[] }
})

export const DELETE = createHandler({ permission: 'reports.write' }, async ({ user, params, audit }) => {
  const existing = await db.scheduledExport.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Scheduled export not found')
  await db.scheduledExport.delete({ where: { id: existing.id } })
  audit({ action: 'DELETE', entity: 'ScheduledExport', entityId: existing.id, summary: `Deleted scheduled export "${existing.name}"` })
  return { ok: true }
})
