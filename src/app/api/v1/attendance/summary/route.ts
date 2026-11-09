import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'
import { summarizeStudentAttendance, weekdaysInRange, type AttendanceStatus } from '@/lib/domain/attendance'

/**
 * Attendance analytics for a date range.
 *   GET /api/v1/attendance/summary?classId=&from=&to=[&sectionId=]
 * Daily (whole-day) registers only — per-period marks are operational detail.
 * Returns per-student tallies + a per-day series for the chart.
 */
export const GET = createHandler({ permission: 'attendance.read' }, async ({ user, query }) => {
  const classId = query.get('classId')
  const from = query.get('from')
  const to = query.get('to')
  const sectionId = query.get('sectionId')
  if (!classId) throw badRequest('classId is required')
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw badRequest('A valid from date is required')
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw badRequest('A valid to date is required')
  if (to < from) throw badRequest('The end date must be on or after the start date')

  const where = {
    schoolId: user.schoolId,
    date: { gte: from, lte: to },
    periodId: null as string | null,
    student: { classId, ...(sectionId ? { sectionId } : {}) },
  }

  const [records, students] = await Promise.all([
    db.studentAttendance.findMany({
      where,
      select: { studentId: true, date: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.student.findMany({
      where: { schoolId: user.schoolId, classId, status: 'ACTIVE', ...(sectionId ? { sectionId } : {}) },
      select: { id: true, admissionNumber: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])

  const summaries = summarizeStudentAttendance(records)
  const byId = new Map(summaries.map(s => [s.studentId, s]))
  const nameOf = new Map(students.map(s => [s.id, `${s.firstName} ${s.lastName}`.trim()]))

  const rows = students.map(st => {
    const s = byId.get(st.id)
    return {
      studentId: st.id,
      admissionNumber: st.admissionNumber,
      fullName: nameOf.get(st.id) ?? '—',
      PRESENT: s?.PRESENT ?? 0,
      ABSENT: s?.ABSENT ?? 0,
      LATE: s?.LATE ?? 0,
      EXCUSED: s?.EXCUSED ?? 0,
      total: s?.total ?? 0,
      rate: s?.rate ?? 0,
    }
  })

  // per-day series for the chart (only weekdays the term could plausibly hold)
  const days = weekdaysInRange(from, to)
  const perDay = days.map(d => {
    const dayRecords = records.filter(r => r.date === d)
    const c: Record<AttendanceStatus | string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
    for (const r of dayRecords) if (r.status in c) c[r.status]++
    const total = dayRecords.length
    return { date: d, ...c, total, rate: total ? Math.round(((c.PRESENT + c.LATE) / total) * 100) : 0 }
  })

  const schoolTotal = records.length
  const schoolPresent = records.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
  return {
    from, to,
    totals: {
      records: schoolTotal,
      rate: schoolTotal ? Math.round((schoolPresent / schoolTotal) * 100) : 0,
      present: records.filter(r => r.status === 'PRESENT').length,
      absent: records.filter(r => r.status === 'ABSENT').length,
      late: records.filter(r => r.status === 'LATE').length,
      excused: records.filter(r => r.status === 'EXCUSED').length,
    },
    students: rows,
    perDay,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
