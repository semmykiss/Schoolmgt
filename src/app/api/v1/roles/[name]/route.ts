import { z } from 'zod'
import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { ALL_PERMISSIONS, ROLE_DEFAULTS } from '@/lib/auth/permissions'

const bodySchema = z.object({ permissions: z.array(z.string()) })

export const PATCH = createHandler({ permission: 'roles.write', body: bodySchema }, async ({ user, params, body, audit }) => {
  const name = params.name
  if (!ROLE_DEFAULTS[name]) throw notFound('Unknown role')
  if (name === 'ADMIN') throw badRequest('Administrator permissions cannot be restricted')

  const valid = body.permissions.filter((p): p is (typeof ALL_PERMISSIONS)[number] =>
    (ALL_PERMISSIONS as readonly string[]).includes(p) || p === '*' || p.endsWith('.*') || p.startsWith('*.'))
  await db.role.upsert({
    where: { schoolId_name: { schoolId: user.schoolId, name } },
    create: { schoolId: user.schoolId, name, permissions: JSON.stringify(valid), isSystem: true },
    update: { permissions: JSON.stringify(valid) },
  })
  audit({ action: 'UPDATE', entity: 'Role', entityId: name, summary: `Updated permissions for ${name}` })
  return { name, permissions: valid }
})
