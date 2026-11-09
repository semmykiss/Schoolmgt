import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ALL_PERMISSIONS, ROLE_DEFAULTS } from '@/lib/auth/permissions'

export const GET = createHandler({ permission: 'roles.read' }, async ({ user }) => {
  const rows = await db.role.findMany({ where: { schoolId: user.schoolId }, orderBy: { name: 'asc' } })
  return {
    items: rows.map(r => ({ name: r.name, permissions: JSON.parse(r.permissions) as string[], isSystem: r.isSystem })),
    defaults: ROLE_DEFAULTS,
    allPermissions: ALL_PERMISSIONS,
  }
})
