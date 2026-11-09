import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { announcementCreateSchema } from '@/lib/validation/communication'

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const audience = query.get('audience')
  const status = query.get('status') // published | draft
  const pinnedOnly = query.get('pinned') === '1'
  if (audience) where.audience = audience
  if (status === 'published') where.publishedAt = { not: null }
  if (status === 'draft') where.publishedAt = null
  if (pinnedOnly) where.pinned = true
  if (q.search) where.title = { contains: q.search }

  const [items, total] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: { class: { select: { id: true, name: true } } },
      skip: q.skip,
      take: q.take,
    }),
    db.announcement.count({ where }),
  ])
  return paginated(items, total, q)
})

export const POST = createHandler({ permission: 'communication.write', body: announcementCreateSchema }, async ({ user, body, audit }) => {
  if (body.audience === 'CLASS') {
    if (!body.classId) throw notFound('Pick a class for class-scoped announcements')
    const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
  }

  const created = await db.announcement.create({
    data: {
      schoolId: user.schoolId,
      title: body.title,
      body: body.body,
      audience: body.audience,
      classId: body.audience === 'CLASS' ? body.classId ?? null : null,
      pinned: body.pinned,
      startAt: body.startAt || null,
      endAt: body.endAt || null,
      createdById: user.id,
    },
    include: { class: { select: { id: true, name: true } } },
  })
  audit({ action: 'create', entity: 'Announcement', entityId: created.id, summary: `Drafted announcement "${body.title}"` })
  return created
})
