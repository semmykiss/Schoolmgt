import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, conflict } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { periodUpdateSchema } from '@/lib/validation/timetable'

export const PATCH = createHandler({ permission: 'timetable.write', body: periodUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Period')
  const period = await db.period.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!period) throw notFound('Period not found')

  if (body.name && body.name !== period.name) {
    const dupe = await db.period.findFirst({ where: { schoolId: user.schoolId, name: body.name } })
    if (dupe) throw conflict(`A period named "${body.name}" already exists`)
  }

  const updated = await db.period.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      startTime: body.startTime,
      endTime: body.endTime,
      order: body.order,
      isBreak: body.isBreak,
    },
  })
  audit({ action: 'UPDATE', entity: 'Period', entityId: id, summary: `Updated period ${updated.name}` })
  return { id }
})

export const DELETE = createHandler({ permission: 'timetable.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Period')
  const period = await db.period.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { _count: { select: { slots: true } } },
  })
  if (!period) throw notFound('Period not found')
  if (period._count.slots > 0) {
    throw conflict(`"${period.name}" is used by ${period._count.slots} timetable slot(s). Clear them from the timetables first.`)
  }
  await db.period.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Period', entityId: id, summary: `Deleted period ${period.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
