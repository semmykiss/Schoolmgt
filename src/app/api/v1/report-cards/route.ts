import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { rankPositions, remarkForAverage, remarkForPrincipal } from '@/lib/domain/grading'
import { reportCardGenerateSchema } from '@/lib/validation/exams'

/**
 * GET /report-cards
 *  ?examId&classId            → list for the class (broadsheet summary per student)
 *  ?examId&studentId          → full printable payload for one student
 */
export const GET = createHandler({ permission: 'exams.read' }, async ({ user, query }) => {
  const examId = query.get('examId')
  const studentId = query.get('studentId')
  const classId = query.get('classId')

  if (studentId) {
    // ── Full print payload ────────────────────────────────────────────────
    if (!examId) throw badRequest('Select an exam to view the report card')
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId },
      select: {
        id: true, admissionNumber: true, firstName: true, lastName: true, otherName: true, gender: true,
        class: { select: { id: true, name: true } },
        section: { select: { name: true } },
      },
    })
    if (!student) throw notFound('Student not found')

    const card = await db.reportCard.findFirst({
      where: { examId: examId, studentId, schoolId: user.schoolId },
    })
    if (!card) throw notFound('No report card generated for this student in this exam yet — generate them from the Broadsheet tab.')

    const [exam, school, results, classSize] = await Promise.all([
      db.exam.findFirst({
        where: { id: examId, schoolId: user.schoolId },
        include: {
          term: { select: { name: true, startDate: true, endDate: true, session: { select: { name: true } } } },
          examType: { select: { name: true } },
        },
      }),
      db.school.findUnique({ where: { id: user.schoolId }, select: { name: true, address: true, city: true, state: true, phone: true, email: true, logoUrl: true, motto: true, primaryColor: true, secondaryColor: true } }),
      db.examResult.findMany({
        where: { schoolId: user.schoolId, examId: examId, studentId },
        include: {
          classSubject: {
            select: { subject: { select: { name: true, code: true } }, teacher: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { classSubject: { subject: { name: 'asc' } } },
        // absent flag needed so the printout shows AB instead of a raw zero
        // (Prisma include returns it alongside classSubject)
      }),
      // Ranked pool: students who actually have report cards (scores) in this exam
      db.reportCard.count({ where: { schoolId: user.schoolId, examId: examId, student: { classId: student.class?.id ?? 'none' } } }),
    ])
    if (!exam) throw notFound('Exam not found')

    return {
      card: {
        id: card.id, totalScore: card.totalScore, average: card.average, position: card.position,
        grade: card.grade, attendanceSummary: card.attendanceSummary,
        teacherRemark: card.teacherRemark, principalRemark: card.principalRemark, published: card.published,
      },
      student,
      exam: { id: exam.id, name: exam.name, term: exam.term, examType: exam.examType },
      school,
      classSize,
      subjects: results.map(r => ({
        subject: r.classSubject.subject.name,
        subjectCode: r.classSubject.subject.code,
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        absent: r.absent,
        grade: r.grade,
        remark: r.remark,
        teacher: r.classSubject.teacher ? [r.classSubject.teacher.firstName, r.classSubject.teacher.lastName].filter(Boolean).join(' ') : null,
      })),
      bands: (await db.gradingScale.findFirst({
        where: { schoolId: user.schoolId, isDefault: true },
        select: { bands: { orderBy: { minScore: 'desc' }, select: { grade: true, minScore: true, maxScore: true, remark: true } } },
      }))?.bands ?? [],
    }
  }

  // ── Class list ──────────────────────────────────────────────────────────
  if (!examId || !classId) throw badRequest('Provide examId + classId, or examId + studentId')
  const items = await db.reportCard.findMany({
    where: { schoolId: user.schoolId, examId, student: { classId } },
    include: {
      student: {
        select: { id: true, admissionNumber: true, firstName: true, lastName: true, class: { select: { name: true } } },
      },
    },
    orderBy: { position: 'asc' },
  })
  return { items }
})

/**
 * POST /report-cards  { examId, classId }
 * Generates/refreshes report cards for every scored student in the class:
 * totals, averages, competition-ranked positions, auto remarks.
 * Existing remarks and published flags are preserved.
 */
export const POST = createHandler({ permission: 'exams.write', body: reportCardGenerateSchema }, async ({ user, body, audit }) => {
  const { examId, classId } = body
  if (!examId || !classId) throw badRequest('Select an exam and a class to generate report cards')

  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId: user.schoolId },
    select: {
      id: true, name: true, publishResults: true,
      term: { select: { startDate: true, endDate: true } },
    },
  })
  if (!exam) throw notFound('Exam not found')

  const results = await db.examResult.findMany({
    where: { schoolId: user.schoolId, examId, classSubject: { classId } },
    select: { studentId: true, marksObtained: true },
  })
  if (results.length === 0) {
    throw badRequest('No scores entered for this class yet — enter marks first, then generate report cards.')
  }

  const totals = new Map<string, { total: number; count: number }>()
  for (const r of results) {
    const t = totals.get(r.studentId) ?? { total: 0, count: 0 }
    t.total += r.marksObtained
    t.count++
    totals.set(r.studentId, t)
  }

  const ranked = rankPositions(
    [...totals.entries()].map(([studentId, v]) => ({
      studentId,
      totalScore: Math.round(v.total * 100) / 100,
      average: Math.round((v.total / v.count) * 100) / 100,
      subjectsCount: v.count,
    })),
    r => r.average,
  )

  const scale = await db.gradingScale.findFirst({
    where: { schoolId: user.schoolId, isDefault: true },
    include: { bands: { orderBy: { minScore: 'desc' } } },
  })
  const bands = scale?.bands ?? []
  const classSize = ranked.length

  // ── Attendance summary per student over the exam's term window ───────────
  const studentIds = ranked.map(r => r.studentId)
  const termFrom = exam.term?.startDate ?? null
  const termTo = exam.term?.endDate ?? null
  const attRows = studentIds.length > 0
    ? await db.studentAttendance.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: studentIds },
          ...(termFrom && termTo ? { date: { gte: termFrom, lte: termTo } } : {}),
        },
        select: { studentId: true, status: true },
      })
    : []
  const attByStudent = new Map<string, { total: number; present: number; late: number; excused: number }>()
  for (const a of attRows) {
    const t = attByStudent.get(a.studentId) ?? { total: 0, present: 0, late: 0, excused: 0 }
    t.total++
    if (a.status === 'PRESENT') t.present++
    else if (a.status === 'LATE') t.late++
    else if (a.status === 'EXCUSED') t.excused++
    attByStudent.set(a.studentId, t)
  }
  const attendanceSummaryFor = (studentId: string): string | null => {
    const t = attByStudent.get(studentId)
    if (!t || t.total === 0) return null
    const parts = [`Present ${t.present}/${t.total}`]
    if (t.late > 0) parts.push(`Late ${t.late}`)
    if (t.excused > 0) parts.push(`Excused ${t.excused}`)
    return parts.join(', ')
  }

  const existing = await db.reportCard.findMany({
    where: { schoolId: user.schoolId, examId, student: { classId } },
    select: { id: true, studentId: true, teacherRemark: true, principalRemark: true, published: true },
  })
  const existingByStudent = new Map(existing.map(c => [c.studentId, c]))

  let generated = 0
  for (const r of ranked) {
    const prev = existingByStudent.get(r.studentId)
    const band = bands.find(b => r.average >= b.minScore && r.average <= b.maxScore)
    const data = {
      totalScore: r.totalScore,
      average: r.average,
      position: r.position,
      grade: band?.grade ?? null,
      attendanceSummary: attendanceSummaryFor(r.studentId),
      teacherRemark: prev?.teacherRemark ?? remarkForAverage(r.average),
      principalRemark: prev?.principalRemark ?? remarkForPrincipal(r.position, classSize),
    }
    await db.reportCard.upsert({
      where: { examId_studentId: { examId, studentId: r.studentId } },
      create: { schoolId: user.schoolId, examId, studentId: r.studentId, ...data, published: exam.publishResults },
      update: data,
    })
    generated++
  }

  audit({
    action: 'UPDATE', entity: 'ReportCard', entityId: examId,
    summary: `Generated ${generated} report card${generated === 1 ? '' : 's'} for "${exam.name}"`,
  })
  return { generated, classSize }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
