import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError, conflict } from '@/lib/api/errors'
import { registerSchema } from '@/lib/validation/auth'
import { hashPassword } from '@/lib/auth/password'
import { signAccessToken } from '@/lib/auth/jwt'
import { issueRefreshToken } from '@/lib/auth/tokens'
import { authResponse, authedFromRecord, sessionPayloadFor } from '@/lib/auth/session'
import { ROLE_DEFAULTS, SYSTEM_ROLES } from '@/lib/auth/permissions'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'school'
}

export const POST = createHandler(
  { auth: false, rateLimit: { bucket: 'register', limit: 5, windowMs: 3600_000 }, body: registerSchema },
  async ({ body, req }) => {
    const email = body.email.toLowerCase().trim()
    if (await db.user.findFirst({ where: { email } })) throw conflict('This email is already registered — try signing in')

    let slug = slugify(body.schoolName)
    if (await db.school.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

    const school = await db.school.create({ data: {
      name: body.schoolName.trim(), slug, type: body.schoolType,
      country: 'Nigeria', currency: 'NGN', locale: 'en-NG', timezone: 'Africa/Lagos',
      phone: body.phone ?? null,
    } })

    for (const role of SYSTEM_ROLES) {
      await db.role.create({ data: { schoolId: school.id, name: role, permissions: JSON.stringify(ROLE_DEFAULTS[role]), isSystem: true } })
    }
    await db.setting.createMany({ data: [
      { schoolId: school.id, key: 'sms.driver', value: JSON.stringify('mock') },
      { schoolId: school.id, key: 'email.driver', value: JSON.stringify('mock') },
      { schoolId: school.id, key: 'payments.driver', value: JSON.stringify('mock') },
    ] })

    const admin = await db.user.create({ data: {
      schoolId: school.id, email, passwordHash: await hashPassword(body.password),
      role: 'ADMIN', fullName: body.adminName.trim(), phone: body.phone ?? null, status: 'ACTIVE',
    } })
    await db.notification.create({ data: {
      schoolId: school.id, userId: admin.id, type: 'SYSTEM',
      title: 'Welcome to SchoolDesk 🎉',
      body: 'Start by setting up sessions, classes and subjects under Academics, then admit your first student.',
    } })

    const authed = await authedFromRecord(admin)
    const payload = await sessionPayloadFor(authed)
    const access = await signAccessToken({ sub: admin.id, sid: school.id, role: 'ADMIN', name: admin.fullName, brn: null })
    const refresh = await issueRefreshToken(admin.id, { userAgent: req.headers.get('user-agent'), ip: req.headers.get('x-forwarded-for') })
    return authResponse(payload, { access, refresh })
  },
)
