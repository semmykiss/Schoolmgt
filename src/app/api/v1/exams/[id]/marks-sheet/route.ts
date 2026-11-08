import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { marksEntrySchema } from '@/lib/validation/exams'
import { gradeFor, remarkForAverage } from '@/lib/domain/grading'

/**
 * GET /exams/:id/marks-sheet?classSubjectId=…
 * Roster (every ACTIVE student in the class) merged with any saved ExamResult,
 * plus the schedule's max/pass marks and the school's default grading bands.
 */
export const GET = createHandler({ permission: 'exams.marks' }, async ({ user, params, query }) => {
  const examId = requireId((params as Record<string, string>).id, 'Exam')
  const classSubjectId = requireId(query.get('classSubjectId') ?? undefined, 'Class subject')

  const [exam, classSubject, scale] = await Promise.all([
    db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId },
      select: { id: true, name: true, publishResults: true },
    }),
    db.classSubject.findFirst({
      where: { id: classSubjectId, schoolId: user.schoolId },
      select: {
        id: true,
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
      },
    }),
    db.gradingScale.findFirst({
      where: { schoolId: user.schoolId, isDefault: true },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    }),
  ])
  if (!exam) throw notFound('Exam not found')
  if (!classSubject) throw notFound('Class subject not found')

  const schedule = await db.examSchedule.findUnique({
    where: { examId_classSubjectId: { examId, classSubjectId } },
    select: { id: true, date: true, maxMarks: true, passMarks: true },
  })

  const [students, results] = await Promise.all([
    db.student.findMany({
      where: { schoolId: user.schoolId, classId: classSubject.class.id, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, admissionNumber: true, firstName: true, lastName: true, otherName: true },
    }),
    db.examResult.findMany({
      where: { schoolId: user.schoolId, examId, classSubjectId },
      select: { studentId: true, marksObtained: true, grade: true, remark: true, updatedAt: true },
    }),
  ])

  const marksByStudent = Object.fromEntries(results.map(r => [r.studentId, r]))
  const roster = students.map(s => {
    const saved = marksByStudent[s.id]
    return {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      fullName: [s.firstName, s.lastName].filter(Boolean).join(' '),
      marks: saved ? saved.marksObtained : null,
      grade: saved?.grade ?? null,
      remark: saved?.remark ?? null,
      savedAt: saved?.updatedAt ?? null,
    }
  })

  return {
    exam: { id: exam.id, name: exam.name, publishResults: exam.publishResults },
    subject: { id: classSubject.subject.id, name: classSubject.subject.name, code: classSubject.subject.code },
    class: classSubject.class,
    schedule: schedule ?? { id: null, date: null, maxMarks: 100, passMarks: 40 },
    bands: scale?.bands ?? [],
    roster,
  }
})

/**
 * POST /exams/:id/marks-sheet — bulk upsert with auto-grading.
 * Rows with absent:true or null-ish marks are treated as 0 unless marks given.
 * Publish-locked exams reject new edits so printed reports stay trustworthy.
 */
export const POST = createHandler({ permission: 'exams.marks', body: marksEntrySchema }, async ({ user, params, body, audit }) => {
  const examId = requireId((params as Record<string, string>).id, 'Exam')
  const [exam, classSubject, scale] = await Promise.all([
    db.exam.findFirst({ where: { id: examId, schoolId: user.schoolId }, select: { id: true, name: true, publishResults: true } }),
    db.classSubject.findFirst({
      where: { id: body.classSubjectId, schoolId: user.schoolId },
      select: { id: true, classId: true, subject: { select: { name: true } }, class: { select: { name: true } } },
    }),
    db.gradingScale.findFirst({
      where: { schoolId: user.schoolId, isDefault: true },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    }),
  ])
  if (!exam) throw notFound('Exam not found')
  if (!classSubject) throw notFound('Class subject not found')
  if (exam.publishResults) {
    throw badRequest('Results are already published for this exam — unpublish it before editing scores.')
  }

  const schedule = await db.examSchedule.findUnique({
    where: { examId_classSubjectId: { examId, classSubjectId: body.classSubjectId } },
    select: { maxMarks: true, passMarks: true },
  })
  const maxMarks = body.maxMarks ?? schedule?.maxMarks ?? 100
  const bands = scale?.bands ?? []
  const studentIds = new Set(
    (await db.student.findMany({
      where: { schoolId: user.schoolId, classId: classSubject.classId },
      select: { id: true },
    })).map(s => s.id),
  )

  let saved = 0
  let graded = 0
  for (const row of body.rows) {
    if (!studentIds.has(row.studentId)) {
      throw badRequest('One of the students does not belong to this class — refresh the marks sheet.')
    }
    const marks = row.absent ? 0 : Math.min(maxMarks, Math.max(0, row.marks))
    const band = gradeFor(marks, maxMarks, bands)
    const remark = band?.remark ?? (marks / maxMarks >= 0.5 ? remarkForAverage((marks / maxMarks) * 100) : 'Below pass mark')
    await db.examResult.upsert({
      where: { examId_studentId_classSubjectId: { examId, studentId: row.studentId, classSubjectId: body.classSubjectId } },
      create: {
        schoolId: user.schoolId, examId, studentId: row.studentId, classSubjectId: body.classSubjectId,
        marksObtained: marks, maxMarks, grade: band?.grade ?? null, remark,
        enteredById: user.id,
      },
      update: {
        marksObtained: marks, maxMarks, grade: band?.grade ?? null, remark,
        enteredById: user.id,
      },
    })
    if (band) graded++
    saved++
  }

  audit({
    action: 'UPDATE', entity: 'ExamResult', entityId: examId,
    summary: `Saved ${saved} ${classSubject.subject.name} score${saved === 1 ? '' : 's'} for ${classSubject.class.name} (${exam.name})`,
  })
  return { saved, graded, maxMarks }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
