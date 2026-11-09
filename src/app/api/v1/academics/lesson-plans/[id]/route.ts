import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { lessonPlanUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.write', body: lessonPlanUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Lesson plan')
  const plan = await db.lessonPlan.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!plan) throw notFound('Lesson plan not found')

  await db.lessonPlan.update({
    where: { id },
    data: {
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.week !== undefined ? { week: body.week ?? null } : {}),
      ...(body.topic !== undefined ? { topic: body.topic.trim() } : {}),
      ...(body.objectives !== undefined ? { objectives: body.objectives?.trim() || null } : {}),
      ...(body.content !== undefined ? { content: body.content?.trim() || null } : {}),
      ...(body.resources !== undefined ? { resources: body.resources?.trim() || null } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'LessonPlan', entityId: id, summary: `Updated lesson plan "${body.topic ?? plan.topic}"` })
  return { ok: true }
})

export const DELETE = createHandler({ permission: 'academic.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Lesson plan')
  const plan = await db.lessonPlan.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!plan) throw notFound('Lesson plan not found')

  await db.lessonPlan.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'LessonPlan', entityId: id, summary: `Deleted lesson plan "${plan.topic}"` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
