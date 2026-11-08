import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { rankPositions } from '@/lib/domain/grading'

/**
 * GET /exams/broadsheet?examId&classId
 * Students × subjects matrix for one class in one exam, with totals,
 * averages, competition-ranked positions and per-subject statistics.
 * Report cards (if generated) supply published position data.
 */
export const GET = createHandler({ permission: 'exams.read' }, async ({ user, query }) => {
  const examId = query.get('examId')
  const classId = query.get('classId')
  if (!examId || !classId) throw notFound('Select an exam and a class to view the broadsheet')

  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId: user.schoolId },
    select: { id: true, name: true, publishResults: true },
  })
  if (!exam) throw notFound('Exam not found')

  const cls = await db.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId },
    select: { id: true, name: true },
  })
  if (!cls) throw notFound('Class not found')

  // Subjects scheduled for this class in this exam define the broadsheet columns
  const schedules = await db.examSchedule.findMany({
    where: { schoolId: user.schoolId, examId, classSubject: { classId } },
    include: { classSubject: { include: { subject: { select: { id: true, name: true, code: true } } } } },
    orderBy: { date: 'asc' },
  })
  const columns = schedules.map(s => ({
    classSubjectId: s.classSubjectId,
    subjectName: s.classSubject.subject.name,
    subjectCode: s.classSubject.subject.code,
    maxMarks: s.maxMarks,
    passMarks: s.passMarks,
  }))

  const [students, results, cards] = await Promise.all([
    db.student.findMany({
      where: { schoolId: user.schoolId, classId, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, admissionNumber: true, firstName: true, lastName: true },
    }),
    db.examResult.findMany({
      where: { schoolId: user.schoolId, examId, classSubject: { classId } },
      select: { studentId: true, classSubjectId: true, marksObtained: true, maxMarks: true, grade: true, remark: true },
    }),
    db.reportCard.findMany({
      where: { schoolId: user.schoolId, examId, student: { classId } },
      select: { studentId: true, totalScore: true, average: true, position: true, grade: true, published: true },
    }),
  ])

  const byStudent = new Map<string, Map<string, { marksObtained: number; maxMarks: number; grade: string | null; remark: string | null }>>()
  for (const r of results) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, new Map())
    byStudent.get(r.studentId)!.set(r.classSubjectId, {
      marksObtained: r.marksObtained, maxMarks: r.maxMarks, grade: r.grade, remark: r.remark,
    })
  }

  const rows = students.map(s => {
    const cells = byStudent.get(s.id) ?? new Map()
    let total = 0
    let scored = 0
    const subjects = columns.map(col => {
      const cell = cells.get(col.classSubjectId) ?? null
      if (cell) { total += cell.marksObtained; scored++ }
      return cell ? {
        marksObtained: cell.marksObtained, maxMarks: cell.maxMarks, grade: cell.grade, remark: cell.remark,
      } : null
    })
    const card = cards.find(c => c.studentId === s.id)
    return {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      fullName: [s.firstName, s.lastName].filter(Boolean).join(' '),
      subjects,
      total,
      scoredSubjects: scored,
      average: scored > 0 ? Math.round((total / scored) * 100) / 100 : null,
      position: card?.position ?? null,
      grade: card?.grade ?? null,
      reportCardExists: !!card,
    }
  })

  // Live positions when every student has scores but report cards are not generated yet
  const scoredRows = rows.filter(r => r.average !== null)
  const livePositions = new Map(
    rankPositions(scoredRows, r => r.average ?? 0).map(r => [r.studentId, r.position]),
  )

  const subjectStats = columns.map(col => {
    const vals = rows.map(r => r.subjects[columns.indexOf(col)]).filter((c): c is NonNullable<typeof c> => !!c)
    const totalMarks = vals.reduce((sum, c) => sum + c.marksObtained, 0)
    const pass = vals.filter(c => c.marksObtained >= col.passMarks).length
    return {
      classSubjectId: col.classSubjectId,
      count: vals.length,
      average: vals.length ? Math.round((totalMarks / vals.length) * 100) / 100 : null,
      passRate: vals.length ? Math.round((pass / vals.length) * 100) : null,
    }
  })

  return {
    exam: { id: exam.id, name: exam.name, publishResults: exam.publishResults },
    class: cls,
    columns,
    rows: rows.map(r => ({ ...r, livePosition: livePositions.get(r.studentId) ?? null })),
    subjectStats,
    reportCardsGenerated: cards.length,
    published: cards.some(c => c.published) || exam.publishResults,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
