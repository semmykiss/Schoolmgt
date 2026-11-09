import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'
import { attendanceSaveSchema } from '@/lib/validation/attendance'
import { STATUS_LABELS } from '@/lib/domain/attendance'

/**
 * Attendance register endpoints.
 *
 * GET /api/v1/attendance?classId=&date=YYYY-MM-DD[&sectionId=][&periodId=]
 *   → the active students of the class + any saved marks for that register
 *     (periodId omitted/null = whole-day register).
 *
 * POST — save the whole register in one shot (delete + recreate for the
 * students present in the payload; untouched students keep their marks).
 * Guardians with portal logins of newly-absent students are notified
 * (whole-day register only).
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const GET = createHandler({ permission: 'attendance.read' }, async ({ user, query }) => {
  const classId = query.get('classId')
  const date = query.get('date')
  const sectionId = query.get('sectionId')
  const periodId = query.get('periodId') // null → whole-day
  if (!classId) throw badRequest('classId is required')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('A valid date (YYYY-MM-DD) is required')

  const [schoolClass, students, records] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: classId, schoolId: user.schoolId } }),
    db.student.findMany({
      where: {
        schoolId: user.schoolId, classId, status: 'ACTIVE',
        ...(sectionId ? { sectionId } : {}),
      },
      select: { id: true, admissionNumber: true, firstName: true, lastName: true, otherName: true, gender: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    db.studentAttendance.findMany({
      where: {
        schoolId: user.schoolId, date,
        periodId: periodId ? periodId : null,
        student: { classId },
      },
      select: { studentId: true, status: true, remarks: true },
    }),
  ])
  if (!schoolClass) throw badRequest('Selected class does not exist in your school')

  const marks: Record<string, { status: string; remarks: string | null }> = {}
  for (const r of records) marks[r.studentId] = { status: r.status, remarks: r.remarks }

  return {
    date,
    periodId: periodId ?? null,
    class: { id: schoolClass.id, name: schoolClass.name },
    weekday: DAY_NAMES[new Date(date + 'T00:00:00').getDay()],
    students: students.map(s => ({
      id: s.id, admissionNumber: s.admissionNumber,
      fullName: [s.firstName, s.lastName].filter(Boolean).join(' '),
      gender: s.gender,
    })),
    marks,
  }
})

export const POST = createHandler({ permission: 'attendance.write', body: attendanceSaveSchema }, async ({ user, body, audit }) => {
  const schoolClass = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
  if (!schoolClass) throw badRequest('Selected class does not exist in your school')
  if (body.sectionId) {
    const section = await db.section.findFirst({ where: { id: body.sectionId, schoolId: user.schoolId, classId: body.classId } })
    if (!section) throw badRequest('Selected section does not belong to that class')
  }
  if (body.periodId) {
    const period = await db.period.findFirst({ where: { id: body.periodId, schoolId: user.schoolId } })
    if (!period) throw badRequest('Selected period does not exist in your school')
  }

  const studentIds = body.records.map(r => r.studentId)
  const students = await db.student.findMany({
    where: { id: { in: studentIds }, schoolId: user.schoolId, classId: body.classId },
    select: { id: true },
  })
  if (students.length !== new Set(studentIds).size) {
    throw badRequest('One or more students do not belong to this class')
  }

  const saved = await db.$transaction(async tx => {
    // replace marks only for the students included in this save
    await tx.studentAttendance.deleteMany({
      where: {
        schoolId: user.schoolId, date: body.date,
        periodId: body.periodId ?? null,
        studentId: { in: studentIds },
      },
    })
    await tx.studentAttendance.createMany({
      data: body.records.map(r => ({
        schoolId: user.schoolId, studentId: r.studentId,
        date: body.date, periodId: body.periodId ?? null,
        status: r.status, remarks: r.remarks || null, takenById: user.id,
      })),
    })
    return body.records.length
  })

  // parent alerts: only for the whole-day register, only for portal-linked guardians
  let notified = 0
  if (!body.periodId) {
    const absentIds = body.records.filter(r => r.status === 'ABSENT').map(r => r.studentId)
    if (absentIds.length) {
      const absentStudents = await db.student.findMany({
        where: { id: { in: absentIds } },
        select: { id: true, firstName: true, lastName: true, guardians: { include: { guardian: { select: { userId: true, firstName: true } } } } },
      })
      const notifications: { schoolId: string; userId: string; title: string; body: string; type: string; link: string }[] = []
      for (const st of absentStudents) {
        const name = `${st.firstName} ${st.lastName}`.trim()
        for (const link of st.guardians) {
          if (link.guardian.userId) {
            notifications.push({
              schoolId: user.schoolId, userId: link.guardian.userId,
              title: 'Absence alert',
              body: `${name} was marked absent on ${body.date}. Please contact the school if this is unexpected.`,
              type: 'ATTENDANCE', link: '#/portal',
            })
          }
        }
      }
      if (notifications.length) {
        await db.notification.createMany({ data: notifications })
        notified = notifications.length
      }
    }
  }

  const counts = body.records.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {})
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${STATUS_LABELS[k] ?? k}`).join(', ')

  audit({
    action: 'UPDATE', entity: 'StudentAttendance',
    summary: `Saved register for ${schoolClass.name} on ${body.date}${body.periodId ? ` (${body.periodId})` : ' (whole day)'} — ${summary}`,
  })
  return { saved, notified, counts }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
