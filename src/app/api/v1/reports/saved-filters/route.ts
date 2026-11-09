import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { saveFilterSchema } from '@/lib/validation/reports'

export const GET = createHandler({ permission: 'reports.read' }, async ({ user, query }) => {
  const moduleName = query.get('module') ?? undefined
  const items = await db.savedFilter.findMany({
    where: { schoolId: user.schoolId, userId: user.id, ...(moduleName ? { module: moduleName } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  return {
    items: items.map(f => {
      let criteria: Record<string, unknown> = {}
      try { criteria = JSON.parse(f.criteria) } catch { /* keep empty */ }
      return { ...f, criteria }
    }),
  }
})

export const POST = createHandler({ permission: 'reports.write', body: saveFilterSchema }, async ({ user, body, audit }) => {
  const created = await db.savedFilter.create({
    data: {
      schoolId: user.schoolId,
      userId: user.id,
      module: body.module,
      name: body.name,
      criteria: JSON.stringify(body.criteria ?? {}),
    },
  })
  audit({ action: 'CREATE', entity: 'SavedFilter', entityId: created.id, summary: `Saved view "${body.name}" (${body.module})` })
  return { ...created, criteria: body.criteria ?? {} }
})
