import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, conflict, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { examTypeUpdateSchema } from '@/lib/validation/exams'

const getId = (p: Record<string, string>) => requireId(p.id, 'Exam type')

export const PATCH = createHandler({ permission: 'exams.setup', body: examTypeUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.examType.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Exam type not found')

  if (body.name && body.name !== existing.name) {
    const dup = await db.examType.findFirst({
      where: { schoolId: user.schoolId, name: body.name, id: { not: id } },
      select: { id: true },
    })
    if (dup) throw conflict('An exam type with that name already exists')
  }

  const updated = await db.examType.update({
    where: { id },
    data: { name: body.name?.trim(), weight: body.weight },
  })
  audit({ action: 'UPDATE', entity: 'ExamType', entityId: id, summary: `Updated exam type "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'exams.setup' }, async ({ user, params, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.examType.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { _count: { select: { exams: true } } },
  })
  if (!existing) throw notFound('Exam type not found')
  if (existing._count.exams > 0) {
    throw badRequest(`Cannot delete "${existing.name}" — ${existing._count.exams} exam${existing._count.exams === 1 ? '' : 's'} use it. Delete those exams first.`)
  }

  await db.examType.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'ExamType', entityId: id, summary: `Deleted exam type "${existing.name}"` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
