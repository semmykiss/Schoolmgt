import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { sessionCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) where.name = { contains: q.search }

  const [items, total] = await Promise.all([
    db.academicSession.findMany({
      where,
      include: { terms: { orderBy: { startDate: 'asc' } } },
      orderBy: { name: 'desc' },
      skip: q.skip, take: q.take,
    }),
    db.academicSession.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'academic.sessions.write', body: sessionCreateSchema }, async ({ user, body, audit }) => {
  const name = body.name.trim()
  if (await db.academicSession.findFirst({ where: { schoolId: user.schoolId, name } })) {
    throw conflict(`Session "${name}" already exists`)
  }
  const created = await db.$transaction(async tx => {
    if (body.setCurrent) {
      await tx.academicSession.updateMany({ where: { schoolId: user.schoolId, isCurrent: true }, data: { isCurrent: false } })
    }
    return tx.academicSession.create({ data: {
      schoolId: user.schoolId, name,
      startDate: body.startDate, endDate: body.endDate,
      isCurrent: body.setCurrent ?? false,
    } })
  })
  audit({ action: 'CREATE', entity: 'AcademicSession', entityId: created.id, summary: `Created session ${name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
