import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { examUpdateSchema } from '@/lib/validation/exams'

const getId = (p: Record<string, string>) => requireId(p.id, 'Exam')

const detailInclude = {
  term: { select: { id: true, name: true, sessionId: true, session: { select: { id: true, name: true, isCurrent: true } } } },
  examType: { select: { id: true, name: true, weight: true } },
  schedules: {
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    include: {
      classSubject: {
        select: {
          id: true,
          subject: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
  _count: { select: { results: true, reportCards: true } },
} as const

export const GET = createHandler({ permission: 'exams.read' }, async ({ user, params }) => {
  const id = getId(params as Record<string, string>)
  const exam = await db.exam.findFirst({ where: { id, schoolId: user.schoolId }, include: detailInclude })
  if (!exam) throw notFound('Exam not found')

  const classes = [...new Map(exam.schedules.map(s => [s.classSubject.class.id, s.classSubject.class])).values()]
  return { ...exam, classes }
})

export const PATCH = createHandler({ permission: 'exams.write', body: examUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.exam.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Exam not found')

  const startDate = body.startDate ?? existing.startDate ?? undefined
  const endDate = body.endDate ?? existing.endDate ?? undefined
  if (startDate && endDate && startDate > endDate) {
    throw badRequest('End date cannot be before the start date')
  }

  if (body.examTypeId && body.examTypeId !== existing.examTypeId) {
    const examType = await db.examType.findFirst({ where: { id: body.examTypeId, schoolId: user.schoolId }, select: { id: true } })
    if (!examType) throw notFound('Selected exam type does not exist')
  }

  const updated = await db.exam.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      examTypeId: body.examTypeId,
      startDate: body.startDate === '' ? null : body.startDate,
      endDate: body.endDate === '' ? null : body.endDate,
    },
    include: detailInclude,
  })
  audit({ action: 'UPDATE', entity: 'Exam', entityId: id, summary: `Updated exam "${updated.name}"` })
  return { ...updated, classes: [...new Map(updated.schedules.map(s => [s.classSubject.class.id, s.classSubject.class])).values()] }
})

export const DELETE = createHandler({ permission: 'exams.write' }, async ({ user, params, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.exam.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { _count: { select: { results: true, reportCards: true, schedules: true } } },
  })
  if (!existing) throw notFound('Exam not found')
  if (existing.publishResults) {
    throw badRequest('Results for this exam are published — unpublish first before deleting.')
  }

  await db.exam.delete({ where: { id } })
  audit({
    action: 'DELETE', entity: 'Exam', entityId: id,
    summary: `Deleted exam "${existing.name}" (${existing._count.schedules} schedules, ${existing._count.results} results)`,
  })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
