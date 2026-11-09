import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { scheduledExportCreateSchema } from '@/lib/validation/reports'
import { REPORT_LABELS } from '@/lib/api/report-data'

const parseJsonField = (raw: string): Record<string, unknown> => {
  try { return JSON.parse(raw) } catch { return {} }
}

export const GET = createHandler({ permission: 'reports.read' }, async ({ user }) => {
  const items = await db.scheduledExport.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: 'desc' },
  })
  return {
    items: items.map(e => ({
      ...e,
      filters: parseJsonField(e.filters),
      recipients: JSON.parse(e.recipients) as string[],
      label: REPORT_LABELS[e.reportKey] ?? e.reportKey,
    })),
  }
})

export const POST = createHandler({ permission: 'reports.write', body: scheduledExportCreateSchema }, async ({ user, body, audit }) => {
  const created = await db.scheduledExport.create({
    data: {
      schoolId: user.schoolId,
      createdById: user.id,
      reportKey: body.reportKey,
      name: body.name,
      frequency: body.frequency,
      format: body.format,
      recipients: JSON.stringify(body.recipients),
      filters: JSON.stringify(body.filters ?? {}),
      active: body.active,
    },
  })
  audit({ action: 'CREATE', entity: 'ScheduledExport', entityId: created.id, summary: `Scheduled "${body.name}" (${body.frequency}, ${body.reportKey})` })
  return { ...created, recipients: body.recipients, filters: body.filters ?? {} }
})
