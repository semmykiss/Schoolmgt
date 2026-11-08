import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { sessionUpdateSchema } from '@/lib/validation/academic'

export const PATCH = createHandler({ permission: 'academic.write', body: sessionUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Session')
  const session = await db.academicSession.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!session) throw notFound('Session not found')

  if (body.name && body.name !== session.name) {
    if (await db.academicSession.findFirst({ where: { schoolId: user.schoolId, name: body.name, id: { not: id } } })) {
      throw conflict(`Session "${body.name}" already exists`)
    }
  }

  const updated = await db.$transaction(async tx => {
    if (body.setCurrent) {
      await tx.academicSession.updateMany({ where: { schoolId: user.schoolId, isCurrent: true, id: { not: id } }, data: { isCurrent: false } })
    }
    return tx.academicSession.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
        ...(body.setCurrent !== undefined ? { isCurrent: body.setCurrent } : {}),
      },
    })
  })

  audit({ action: 'UPDATE', entity: 'AcademicSession', entityId: id, summary: `Updated session ${updated.name}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'academic.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Session')
  const session = await db.academicSession.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!session) throw notFound('Session not found')

  const exams = await db.exam.count({ where: { schoolId: user.schoolId, term: { sessionId: id } } })
  if (exams > 0) throw conflict(`Cannot delete "${session.name}" — ${exams} exam(s) are recorded under its terms`)

  await db.lessonPlan.deleteMany({
    where: { schoolId: user.schoolId, termId: { in: (await db.term.findMany({ where: { sessionId: id }, select: { id: true } })).map(t => t.id) } },
  })
  await db.academicSession.delete({ where: { id } })

  audit({ action: 'DELETE', entity: 'AcademicSession', entityId: id, summary: `Deleted session ${session.name}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
