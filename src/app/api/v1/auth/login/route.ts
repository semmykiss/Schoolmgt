import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError } from '@/lib/api/errors'
import { loginSchema } from '@/lib/validation/auth'
import { verifyPassword } from '@/lib/auth/password'
import { signAccessToken } from '@/lib/auth/jwt'
import { issueRefreshToken } from '@/lib/auth/tokens'
import { authResponse, authedFromRecord, sessionPayloadFor } from '@/lib/auth/session'

export const POST = createHandler(
  { auth: false, rateLimit: { bucket: 'login', limit: 10, windowMs: 60_000 }, body: loginSchema },
  async ({ body, req }) => {
    const email = body.email.toLowerCase().trim()
    const candidates = await db.user.findMany({ where: { email }, take: 3 })
    let matched: Awaited<ReturnType<typeof db.user.findFirst>> = null
    for (const u of candidates) {
      if (await verifyPassword(u.passwordHash, body.password)) { matched = u; break }
    }
    if (!matched) throw new ApiError(401, 'Invalid email or password')
    if (matched.status !== 'ACTIVE') throw new ApiError(403, 'This account has been suspended. Contact your administrator.')

    const authed = await authedFromRecord(matched)
    const payload = await sessionPayloadFor(authed)
    const access = await signAccessToken({ sub: matched.id, sid: matched.schoolId, role: matched.role, name: matched.fullName, brn: matched.branchId })
    const refresh = await issueRefreshToken(matched.id, { userAgent: req.headers.get('user-agent'), ip: req.headers.get('x-forwarded-for') })
    await db.user.update({ where: { id: matched.id }, data: { lastLoginAt: new Date() } })
    await db.auditLog.create({ data: {
      schoolId: matched.schoolId, userId: matched.id, userName: matched.fullName,
      action: 'LOGIN', entity: 'Auth', summary: 'Signed in',
      ip: req.headers.get('x-forwarded-for'),
    } })
    return authResponse(payload, { access, refresh })
  },
)
