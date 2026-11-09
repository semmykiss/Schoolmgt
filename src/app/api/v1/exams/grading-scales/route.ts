import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { gradingScaleCreateSchema } from '@/lib/validation/exams'

export const GET = createHandler({ permission: 'exams.read' }, async ({ user }) => {
  const items = await db.gradingScale.findMany({
    where: { schoolId: user.schoolId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { bands: { orderBy: { minScore: 'desc' } } },
  })
  return { items }
})

export const POST = createHandler({ permission: 'exams.write', body: gradingScaleCreateSchema }, async ({ user, body, audit }) => {
  const dup = await db.gradingScale.findFirst({
    where: { schoolId: user.schoolId, name: body.name },
    select: { id: true },
  })
  if (dup) throw conflict('A grading scale with that name already exists')

  const created = await db.$transaction(async tx => {
    if (body.isDefault) {
      await tx.gradingScale.updateMany({ where: { schoolId: user.schoolId }, data: { isDefault: false } })
    }
    return tx.gradingScale.create({
      data: {
        schoolId: user.schoolId,
        name: body.name,
        isDefault: body.isDefault,
        bands: { create: body.bands.map(b => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore, remark: b.remark, points: b.points ?? null })) },
      },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    })
  })

  audit({ action: 'CREATE', entity: 'GradingScale', entityId: created.id, summary: `Created grading scale "${created.name}" with ${created.bands.length} bands` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
