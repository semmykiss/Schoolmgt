import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { subjectCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 200 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) {
    where.OR = [{ name: { contains: q.search } }, { code: { contains: q.search } }]
  }
  const [items, total] = await Promise.all([
    db.subject.findMany({
      where,
      include: { _count: { select: { classSubjects: true } } },
      orderBy: { name: 'asc' },
      skip: q.skip, take: q.take,
    }),
    db.subject.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'academic.subjects.write', body: subjectCreateSchema }, async ({ user, body, audit }) => {
  const name = body.name.trim()
  if (await db.subject.findFirst({ where: { schoolId: user.schoolId, name } })) {
    throw conflict(`Subject "${name}" already exists`)
  }
  const created = await db.subject.create({ data: {
    schoolId: user.schoolId, name,
    code: body.code?.trim() || null, isCore: body.isCore,
  } })
  audit({ action: 'CREATE', entity: 'Subject', entityId: created.id, summary: `Created subject ${name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
