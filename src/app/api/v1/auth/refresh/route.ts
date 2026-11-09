import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError } from '@/lib/api/errors'
import { signAccessToken } from '@/lib/auth/jwt'
import { rotateRefreshToken } from '@/lib/auth/tokens'
import { authResponse, COOKIES } from '@/lib/auth/session'

export const POST = createHandler({ auth: false }, async ({ req }) => {
  const raw = req.cookies.get(COOKIES.refresh)?.value
  if (!raw) throw new ApiError(401, 'No refresh token present')
  const { userId, token } = await rotateRefreshToken(raw, {
    userAgent: req.headers.get('user-agent'), ip: req.headers.get('x-forwarded-for'),
  })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.status !== 'ACTIVE') throw new ApiError(401, 'Account unavailable')
  const access = await signAccessToken({ sub: user.id, sid: user.schoolId, role: user.role, name: user.fullName, brn: user.branchId })
  return authResponse({ ok: true }, { access, refresh: token })
})
