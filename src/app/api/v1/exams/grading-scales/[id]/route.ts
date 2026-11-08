import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, conflict, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { gradingScaleUpdateSchema } from '@/lib/validation/exams'

const getId = (p: Record<string, string>) => requireId(p.id, 'Grading scale')

export const PATCH = createHandler({ permission: 'exams.write', body: gradingScaleUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.gradingScale.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Grading scale not found')

  if (body.name && body.name !== existing.name) {
    const dup = await db.gradingScale.findFirst({
      where: { schoolId: user.schoolId, name: body.name, id: { not: id } },
      select: { id: true },
    })
    if (dup) throw conflict('A grading scale with that name already exists')
  }

  const updated = await db.$transaction(async tx => {
    if (body.isDefault) {
      await tx.gradingScale.updateMany({ where: { schoolId: user.schoolId, id: { not: id } }, data: { isDefault: false } })
    }
    return tx.gradingScale.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        isDefault: body.isDefault,
        ...(body.bands ? {
          bands: { deleteMany: {}, create: body.bands.map(b => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore, remark: b.remark, points: b.points ?? null })) },
        } : {}),
      },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    })
  })

  audit({ action: 'UPDATE', entity: 'GradingScale', entityId: id, summary: `Updated grading scale "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'exams.write' }, async ({ user, params, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.gradingScale.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Grading scale not found')
  if (existing.isDefault) {
    throw badRequest('This is the default grading scale — set another scale as default first.')
  }

  await db.gradingScale.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'GradingScale', entityId: id, summary: `Deleted grading scale "${existing.name}"` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
