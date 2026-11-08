import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError } from '@/lib/api/errors'
import { changePasswordSchema } from '@/lib/validation/auth'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { revokeAllUserTokens } from '@/lib/auth/tokens'

export const POST = createHandler({ body: changePasswordSchema }, async ({ user, body }) => {
  const record = await db.user.findUnique({ where: { id: user.id } })
  if (!record) throw new ApiError(404, 'Account not found')
  if (!(await verifyPassword(record.passwordHash, body.currentPassword))) {
    throw new ApiError(400, 'Current password is incorrect')
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } })
  await revokeAllUserTokens(user.id)
  await db.auditLog.create({ data: {
    schoolId: user.schoolId, userId: user.id, userName: user.fullName,
    action: 'UPDATE', entity: 'Auth', summary: 'Changed password',
  } })
  return { ok: true }
})
