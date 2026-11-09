import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { eventCreateSchema } from '@/lib/validation/communication'
import { resolveAudienceUsers } from '@/lib/api/audience'
import { notifyUsers } from '@/lib/api/notify'

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, query }) => {
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const from = query.get('from')
  const to = query.get('to')
  const type = query.get('type')
  if (from || to) where.startDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  if (type) where.type = type
  if (query.get('upcoming') === '1') where.endDate = { gte: new Date().toISOString().slice(0, 10) }

  // Range queries may return a calendar month — honour paging only when asked
  const wantsPaging = query.get('page') !== null || query.get('pageSize') !== null
  const q = parseListQuery(query, { pageSize: 100 })

  const [items, total] = await Promise.all([
    db.calendarEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
      include: { class: { select: { id: true, name: true } } },
      ...(wantsPaging ? { skip: q.skip, take: q.take } : {}),
    }),
    db.calendarEvent.count({ where }),
  ])
  return wantsPaging ? paginated(items, total, q) : { items, total }
})

export const POST = createHandler({ permission: 'communication.events.write', body: eventCreateSchema }, async ({ user, body, audit }) => {
  if (body.audience === 'CLASS' && !body.classId) {
    throw notFound('Pick a class for class-scoped events')
  }
  const created = await db.calendarEvent.create({
    data: {
      schoolId: user.schoolId,
      title: body.title,
      description: body.description || null,
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      audience: body.audience,
      classId: body.audience === 'CLASS' ? body.classId ?? null : null,
      createdById: user.id,
    },
    include: { class: { select: { id: true, name: true } } },
  })

  // In-app heads-up to the affected audience so the event lands in portals.
  const audienceUsers = await resolveAudienceUsers(user.schoolId, body.audience, created.classId)
  await notifyUsers(user.schoolId, audienceUsers.map(u => u.id), {
    title: `New event — ${created.title}`,
    body: `${created.startDate}${created.endDate !== created.startDate ? ` → ${created.endDate}` : ''}. Check the portal calendar for details.`,
    type: 'ANNOUNCEMENT',
    link: u => u.role === 'PARENT' || u.role === 'STUDENT' ? '#/portal' : '#/calendar',
  })

  audit({ action: 'create', entity: 'CalendarEvent', entityId: created.id, summary: `Scheduled event "${body.title}" (${body.startDate}) — ${audienceUsers.length} notified` })
  return created
})
