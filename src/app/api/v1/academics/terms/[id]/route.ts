import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { termUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.sessions.write', body: termUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Term')
  const term = await db.term.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!term) throw notFound('Term not found')

  if (body.name && body.name !== term.name) {
    if (await db.term.findFirst({ where: { sessionId: term.sessionId, name: body.name, id: { not: id } } })) {
      throw conflict('A term with that name already exists in this session')
    }
  }

  const updated = await db.$transaction(async tx => {
    if (body.setCurrent) {
      await tx.term.updateMany({ where: { schoolId: user.schoolId, isCurrent: true, id: { not: id } }, data: { isCurrent: false } })
      await tx.academicSession.updateMany({ where: { schoolId: user.schoolId, isCurrent: true, id: { not: term.sessionId } }, data: { isCurrent: false } })
      await tx.academicSession.update({ where: { id: term.sessionId }, data: { isCurrent: true } })
    }
    return tx.term.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
        ...(body.setCurrent !== undefined ? { isCurrent: body.setCurrent } : {}),
      },
    })
  })

  audit({ action: 'UPDATE', entity: 'Term', entityId: id, summary: `Updated term ${updated.name}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'academic.sessions.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Term')
  const term = await db.term.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!term) throw notFound('Term not found')

  const exams = await db.exam.count({ where: { termId: id } })
  if (exams > 0) throw conflict(`Cannot delete this term — ${exams} exam(s) are recorded under it`)

  await db.lessonPlan.deleteMany({ where: { schoolId: user.schoolId, termId: id } })
  await db.term.delete({ where: { id } })

  audit({ action: 'DELETE', entity: 'Term', entityId: id, summary: `Deleted ${term.name} term` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
