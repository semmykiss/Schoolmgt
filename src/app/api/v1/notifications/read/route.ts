import { z } from 'zod'
import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'

const bodySchema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() })

export const POST = createHandler({ body: bodySchema }, async ({ user, body }) => {
  const where: Record<string, unknown> = { userId: user.id, read: false }
  if (body.ids?.length) where.id = { in: body.ids }
  else if (!body.all) return { ok: true }
  const res = await db.notification.updateMany({ where, data: { read: true } })
  return { updated: res.count }
})
