import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { scheduleUpdateSchema } from '@/lib/validation/exams'

const getId = (p: Record<string, string>) => requireId(p.id, 'Schedule')

export const PATCH = createHandler({ permission: 'exams.write', body: scheduleUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.examSchedule.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { classSubject: { include: { subject: { select: { name: true } } } } },
  })
  if (!existing) throw notFound('Schedule not found')

  const startTime = body.startTime ?? existing.startTime
  const endTime = body.endTime ?? existing.endTime
  if (startTime >= endTime) throw badRequest('End time must be after the start time')
  if (body.passMarks !== undefined && (body.maxMarks ?? existing.maxMarks) < body.passMarks) {
    throw badRequest('Pass mark cannot exceed the maximum marks')
  }

  const updated = await db.examSchedule.update({
    where: { id },
    data: {
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      maxMarks: body.maxMarks,
      passMarks: body.passMarks,
    },
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
  })
  audit({
    action: 'UPDATE', entity: 'ExamSchedule', entityId: id,
    summary: `Updated schedule for ${existing.classSubject.subject.name} in "${existing.date}" slot`,
  })
  return updated
})

export const DELETE = createHandler({ permission: 'exams.write' }, async ({ user, params, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.examSchedule.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { classSubject: { include: { subject: { select: { name: true } } } } },
  })
  if (!existing) throw notFound('Schedule not found')

  // Marks already entered for this paper would orphan the max-mark reference
  const marked = await db.examResult.count({
    where: { schoolId: user.schoolId, examId: existing.examId, classSubjectId: existing.classSubjectId },
  })
  if (marked > 0) {
    throw badRequest(`${marked} score${marked === 1 ? ' was' : 's were'} already entered for ${existing.classSubject.subject.name}. Clear them from the Marks Entry tab first.`)
  }

  await db.examSchedule.delete({ where: { id } })
  audit({
    action: 'DELETE', entity: 'ExamSchedule', entityId: id,
    summary: `Removed ${existing.classSubject.subject.name} from the exam timetable (${existing.date})`,
  })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
