import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { updateUserSchema } from '@/lib/validation/user'
import { hashPassword } from '@/lib/auth/password'
import { revokeAllUserTokens } from '@/lib/auth/tokens'

async function activeAdminCount(schoolId: string, excludeId?: string): Promise<number> {
  const admins = await db.user.findMany({ where: { schoolId, role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
  return admins.filter(a => a.id !== excludeId).length
}

export const PATCH = createHandler(
  { permission: 'users.write', body: updateUserSchema },
  async ({ user, params, body, audit }) => {
    const id = params.id
    const target = await db.user.findFirst({ where: { id, schoolId: user.schoolId } })
    if (!target) throw notFound('User not found')

    const demoting = body.role && body.role !== 'ADMIN' && target.role === 'ADMIN'
    const suspending = body.status === 'SUSPENDED'
    if ((demoting || suspending) && target.id === user.id) {
      throw badRequest('You cannot remove your own admin access')
    }
    if ((demoting || suspending) && (await activeAdminCount(user.schoolId, target.id)) === 0) {
      throw badRequest('At least one active administrator is required')
    }

    const data: Record<string, unknown> = {}
    if (body.fullName !== undefined) data.fullName = body.fullName.trim()
    if (body.phone !== undefined) data.phone = body.phone
    if (body.role !== undefined) data.role = body.role
    if (body.status !== undefined) data.status = body.status
    if (body.branchId !== undefined) data.branchId = body.branchId
    if (body.password) {
      data.passwordHash = await hashPassword(body.password)
      await revokeAllUserTokens(target.id)
    }

    await db.user.update({ where: { id: target.id }, data })
    audit({ action: 'UPDATE', entity: 'User', entityId: target.id, summary: `Updated user ${target.fullName}` })
    return { ok: true }
  },
)

export const DELETE = createHandler({ permission: 'users.write' }, async ({ user, params, audit }) => {
  const id = params.id
  const target = await db.user.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!target) throw notFound('User not found')
  if (target.id === user.id) throw badRequest('You cannot delete your own account')
  if (target.role === 'ADMIN' && (await activeAdminCount(user.schoolId, target.id)) === 0) {
    throw badRequest('At least one active administrator is required')
  }
  await db.user.delete({ where: { id: target.id } })
  audit({ action: 'DELETE', entity: 'User', entityId: target.id, summary: `Deleted user ${target.fullName}` })
  return { ok: true }
})
