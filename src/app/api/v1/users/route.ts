import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { createUserSchema } from '@/lib/validation/user'
import { hashPassword } from '@/lib/auth/password'
import { SYSTEM_ROLES } from '@/lib/auth/permissions'

export const GET = createHandler({ permission: 'users.read' }, async ({ user, query }) => {
  const q = parseListQuery(query)
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) {
    where.OR = [
      { fullName: { contains: q.search } },
      { email: { contains: q.search } },
    ]
  }
  const role = query.get('role')
  if (role) where.role = role
  const status = query.get('status')
  if (status) where.status = status

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: { id: true, email: true, fullName: true, role: true, phone: true, status: true, branchId: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: q.skip, take: q.take,
    }),
    db.user.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'users.write', body: createUserSchema }, async ({ user, body, audit }) => {
  const email = body.email.toLowerCase().trim()
  if (await db.user.findFirst({ where: { schoolId: user.schoolId, email } })) {
    throw conflict('A user with this email already exists in your school')
  }
  if (!SYSTEM_ROLES.includes(body.role)) throw notFound('Unknown role')
  const created = await db.user.create({ data: {
    schoolId: user.schoolId, branchId: body.branchId ?? null,
    email, fullName: body.fullName.trim(), role: body.role, phone: body.phone ?? null,
    passwordHash: await hashPassword(body.password), status: 'ACTIVE',
  } })
  audit({ action: 'CREATE', entity: 'User', entityId: created.id, summary: `Created ${body.role} user ${created.fullName}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
