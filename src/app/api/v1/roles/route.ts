import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ALL_PERMISSIONS, PERMISSION_CATALOG, ROLE_DEFAULTS, can, mergePermissions } from '@/lib/auth/permissions'

export const GET = createHandler({ permission: 'roles.read' }, async ({ user }) => {
  const rows = await db.role.findMany({ where: { schoolId: user.schoolId }, orderBy: { name: 'asc' } })
  return {
    // Effective permissions = role defaults (code) ∪ per-school overrides (db).
    items: rows.map(r => {
      const overrides = JSON.parse(r.permissions) as string[]
      const defaults = ROLE_DEFAULTS[r.name] ?? []
      return {
        name: r.name,
        permissions: mergePermissions(defaults, overrides),
        isSystem: r.isSystem,
        hasOverrides: overrides.length > 0,
      }
    }),
    defaults: ROLE_DEFAULTS,
    allPermissions: ALL_PERMISSIONS,
    catalog: PERMISSION_CATALOG,
  }
})
