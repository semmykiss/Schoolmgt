import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { templateCreateSchema } from '@/lib/validation/communication'

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const channel = query.get('channel')
  if (channel) where.channel = channel
  if (q.search) where.name = { contains: q.search }

  const [items, total] = await Promise.all([
    db.messageTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: q.skip,
      take: q.take,
    }),
    db.messageTemplate.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'communication.write', body: templateCreateSchema }, async ({ user, body, audit }) => {
  const existing = await db.messageTemplate.findFirst({
    where: { schoolId: user.schoolId, name: body.name },
    select: { id: true },
  })
  if (existing) throw conflict(`A template named "${body.name}" already exists`)

  const created = await db.messageTemplate.create({
    data: {
      schoolId: user.schoolId,
      name: body.name,
      channel: body.channel,
      subject: body.subject || null,
      body: body.body,
    },
  })
  audit({ action: 'create', entity: 'MessageTemplate', entityId: created.id, summary: `Created ${body.channel} template "${body.name}"` })
  return created
})
