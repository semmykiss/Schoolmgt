// POST /communication/announcements/:id/publish — flips a draft live and fans
// out in-app notifications to the targeted audience (per-role deep links).
import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { resolveAudienceUsers } from '@/lib/api/audience'

export const POST = createHandler({ permission: 'communication.write' }, async ({ user, params, audit }) => {
  const announcement = await db.announcement.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { class: { select: { id: true, name: true } } },
  })
  if (!announcement) throw notFound('Announcement not found')
  if (announcement.publishedAt) return announcement // idempotent

  const updated = await db.announcement.update({
    where: { id: announcement.id },
    data: { publishedAt: new Date() },
    include: { class: { select: { id: true, name: true } } },
  })

  // Fan out in-app notifications
  const users = await resolveAudienceUsers(user.schoolId, announcement.audience as 'ALL', announcement.classId)
  if (users.length > 0) {
    await db.notification.createMany({
      data: users.map(u => ({
        schoolId: user.schoolId,
        userId: u.id,
        title: announcement.title,
        body: announcement.body.slice(0, 180),
        type: 'ANNOUNCEMENT',
        link: u.role === 'PARENT' || u.role === 'STUDENT' ? '#/portal' : '#/announcements',
      })),
    })
  }

  audit({
    action: 'publish',
    entity: 'Announcement',
    entityId: updated.id,
    summary: `Published announcement "${updated.title}" to ${announcement.audience}${announcement.class ? ` (${announcement.class.name})` : ''} — ${users.length} notified`,
  })
  return { ...updated, notified: users.length }
})
