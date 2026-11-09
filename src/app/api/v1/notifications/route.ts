import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'

export const GET = createHandler({}, async ({ user }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ])
  return { items, unread }
})
