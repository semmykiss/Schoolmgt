import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, conflict, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { scheduleCreateSchema } from '@/lib/validation/exams'
import { timeRangesOverlap } from '@/lib/domain/grading'

const scheduleInclude = {
  classSubject: {
    select: {
      id: true,
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const

export const GET = createHandler({ permission: 'exams.read' }, async ({ user, query }) => {
  const examId = requireId(query.get('examId') ?? undefined, 'Exam')
  const exam = await db.exam.findFirst({ where: { id: examId, schoolId: user.schoolId }, select: { id: true } })
  if (!exam) throw notFound('Exam not found')

  const items = await db.examSchedule.findMany({
    where: { schoolId: user.schoolId, examId },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    include: scheduleInclude,
  })
  return { items }
})

export const POST = createHandler({ permission: 'exams.write', body: scheduleCreateSchema }, async ({ user, body, audit }) => {
  const [exam, classSubject] = await Promise.all([
    db.exam.findFirst({ where: { id: body.examId, schoolId: user.schoolId }, select: { id: true, name: true } }),
    db.classSubject.findFirst({
      where: { id: body.classSubjectId, schoolId: user.schoolId },
      include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } },
    }),
  ])
  if (!exam) throw notFound('Exam not found')
  if (!classSubject) throw notFound('Class subject not found')

  const dup = await db.examSchedule.findFirst({
    where: { schoolId: user.schoolId, examId: body.examId, classSubjectId: body.classSubjectId },
    select: { id: true },
  })
  if (dup) throw conflict(`${classSubject.subject.name} already has a schedule in this exam — edit the existing one.`)

  // Same class, same date, overlapping time → exam timetable clash
  const sameDay = await db.examSchedule.findMany({
    where: { schoolId: user.schoolId, examId: body.examId, date: body.date },
    include: { classSubject: { select: { classId: true, subject: { select: { name: true } } } } },
  })
  const clash = sameDay.find(s =>
    s.classSubject.classId === classSubject.class.id &&
    timeRangesOverlap(body.startTime, body.endTime, s.startTime, s.endTime),
  )
  if (clash) {
    throw conflict(`${classSubject.class.name} already writes ${clash.classSubject.subject.name} ${clash.startTime}–${clash.endTime} on ${body.date}.`, {
      scheduleId: clash.id,
    })
  }

  const created = await db.examSchedule.create({
    data: {
      schoolId: user.schoolId,
      examId: body.examId,
      classSubjectId: body.classSubjectId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      maxMarks: body.maxMarks,
      passMarks: body.passMarks,
    },
    include: scheduleInclude,
  })
  audit({
    action: 'CREATE', entity: 'ExamSchedule', entityId: created.id,
    summary: `Scheduled ${classSubject.subject.name} (${classSubject.class.name}) for "${exam.name}" on ${body.date}`,
  })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
