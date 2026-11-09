import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { announcementUpdateSchema } from '@/lib/validation/communication'

async function getAnnouncement(schoolId: string, id: string) {
  const announcement = await db.announcement.findFirst({
    where: { id, schoolId },
    include: { class: { select: { id: true, name: true } } },
  })
  if (!announcement) throw notFound('Announcement not found')
  return announcement
}

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, params }) =>
  getAnnouncement(user.schoolId, params.id))

export const PATCH = createHandler({ permission: 'communication.announcements.write', body: announcementUpdateSchema }, async ({ user, params, body, audit }) => {
  const announcement = await getAnnouncement(user.schoolId, params.id)

  if (body.audience === 'CLASS') {
    const classId = body.classId ?? announcement.classId
    if (!classId) throw notFound('Pick a class for class-scoped announcements')
    const cls = await db.schoolClass.findFirst({ where: { id: classId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
  }

  const updated = await db.announcement.update({
    where: { id: announcement.id },
    data: {
      title: body.title ?? undefined,
      body: body.body ?? undefined,
      audience: body.audience ?? undefined,
      classId: body.classId === undefined ? undefined : (body.audience === 'CLASS' ? body.classId ?? announcement.classId : null),
      pinned: body.pinned ?? undefined,
      startAt: body.startAt === undefined ? undefined : (body.startAt || null),
      endAt: body.endAt === undefined ? undefined : (body.endAt || null),
      // published flag drives publish/unpublish; publishing without an explicit
      // timestamp keeps the original publish date on re-edits
      publishedAt: body.published === undefined
        ? undefined
        : (body.published ? (announcement.publishedAt ?? new Date()) : null),
    },
    include: { class: { select: { id: true, name: true } } },
  })

  const published = body.published === true && announcement.publishedAt === null
  audit({
    action: published ? 'publish' : 'update',
    entity: 'Announcement',
    entityId: updated.id,
    summary: published ? `Published announcement "${updated.title}"` : `Updated announcement "${updated.title}"`,
  })
  return updated
})

export const DELETE = createHandler({ permission: 'communication.announcements.write' }, async ({ user, params, audit }) => {
  const announcement = await getAnnouncement(user.schoolId, params.id)
  await db.announcement.delete({ where: { id: announcement.id } })
  audit({ action: 'delete', entity: 'Announcement', entityId: announcement.id, summary: `Deleted announcement "${announcement.title}"` })
  return { ok: true }
})
