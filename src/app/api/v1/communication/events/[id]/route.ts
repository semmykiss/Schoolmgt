import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { eventUpdateSchema } from '@/lib/validation/communication'

async function getEvent(schoolId: string, id: string) {
  const event = await db.calendarEvent.findFirst({
    where: { id, schoolId },
    include: { class: { select: { id: true, name: true } } },
  })
  if (!event) throw notFound('Event not found')
  return event
}

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, params }) =>
  getEvent(user.schoolId, params.id))

export const PATCH = createHandler({ permission: 'communication.events.write', body: eventUpdateSchema }, async ({ user, params, body, audit }) => {
  const event = await getEvent(user.schoolId, params.id)
  if (body.audience === 'CLASS' && !body.classId && !event.classId) {
    throw notFound('Pick a class for class-scoped events')
  }

  const updated = await db.calendarEvent.update({
    where: { id: event.id },
    data: {
      title: body.title ?? undefined,
      description: body.description === undefined ? undefined : (body.description || null),
      type: body.type ?? undefined,
      startDate: body.startDate ?? undefined,
      endDate: body.endDate ?? undefined,
      audience: body.audience ?? undefined,
      classId: body.classId === undefined ? undefined : (body.audience === 'CLASS' ? body.classId ?? event.classId : null),
    },
    include: { class: { select: { id: true, name: true } } },
  })
  audit({ action: 'update', entity: 'CalendarEvent', entityId: updated.id, summary: `Updated event "${updated.title}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'communication.events.write' }, async ({ user, params, audit }) => {
  const event = await getEvent(user.schoolId, params.id)
  await db.calendarEvent.delete({ where: { id: event.id } })
  audit({ action: 'delete', entity: 'CalendarEvent', entityId: event.id, summary: `Deleted event "${event.title}"` })
  return { ok: true }
})
