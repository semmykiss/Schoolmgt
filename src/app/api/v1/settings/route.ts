import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { upsertSettingSchema } from '@/lib/validation/school'

export const GET = createHandler({ permission: 'settings.read' }, async ({ user }) => {
  const rows = await db.setting.findMany({ where: { schoolId: user.schoolId } })
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value) } catch { out[r.key] = r.value }
  }
  return out
})

export const PUT = createHandler({ permission: 'settings.write', body: upsertSettingSchema }, async ({ user, body, audit }) => {
  const value = JSON.stringify(body.value ?? null)
  await db.setting.upsert({
    where: { schoolId_key: { schoolId: user.schoolId, key: body.key } },
    create: { schoolId: user.schoolId, key: body.key, value },
    update: { value },
  })
  audit({ action: 'UPDATE', entity: 'Setting', entityId: body.key, summary: `Updated setting ${body.key}` })
  return { key: body.key, value: body.value ?? null }
})
