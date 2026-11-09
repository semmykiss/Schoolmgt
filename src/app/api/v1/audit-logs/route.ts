import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import type { Prisma } from '@prisma/client'

const ACTION_CHOICES = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PUBLISH', 'APPROVE', 'REJECT', 'RESTORE']

export const GET = createHandler({ permission: 'audit.read' }, async ({ user, query }) => {
  const page = Math.max(1, Number(query.get('page') ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(5, Number(query.get('pageSize') ?? '25') || 25))
  const action = query.get('action') ?? undefined
  const entity = query.get('entity') ?? undefined
  const q = query.get('q')?.trim() || undefined
  const from = query.get('from') ?? undefined
  const to = query.get('to') ?? undefined

  const where: Prisma.AuditLogWhereInput = { schoolId: user.schoolId }
  if (action) where.action = action
  if (entity) where.entity = entity
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
    }
  }
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { summary: { contains: q } },
      { entity: { contains: q } },
      { entityId: { contains: q } },
    ]
  }

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items: rows, total, page, pageSize, actions: ACTION_CHOICES }
})
