import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'
import { staffAttendanceSaveSchema } from '@/lib/validation/attendance'
import { STATUS_LABELS } from '@/lib/domain/attendance'

/**
 * Staff attendance register.
 *   GET  /api/v1/attendance/staff?date=YYYY-MM-DD → active employees + saved marks
 *   POST — save the whole staff register for the day in one shot.
 */
export const GET = createHandler({ permission: 'attendance.read' }, async ({ user, query }) => {
  const date = query.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('A valid date (YYYY-MM-DD) is required')

  const [employees, records] = await Promise.all([
    db.employee.findMany({
      where: { schoolId: user.schoolId, status: 'ACTIVE' },
      select: { id: true, staffCode: true, firstName: true, lastName: true, position: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    db.staffAttendance.findMany({
      where: { schoolId: user.schoolId, date },
      select: { employeeId: true, status: true, checkIn: true, checkOut: true, remarks: true },
    }),
  ])

  const marks: Record<string, { status: string; checkIn: string | null; checkOut: string | null; remarks: string | null }> = {}
  for (const r of records) {
    marks[r.employeeId] = { status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, remarks: r.remarks }
  }

  return {
    date,
    employees: employees.map(e => ({
      id: e.id, staffCode: e.staffCode, position: e.position,
      fullName: `${e.firstName} ${e.lastName}`.trim(),
    })),
    marks,
  }
})

export const POST = createHandler({ permission: 'attendance.staff.write', body: staffAttendanceSaveSchema }, async ({ user, body, audit }) => {
  const employeeIds = body.records.map(r => r.employeeId)
  const employees = await db.employee.findMany({
    where: { id: { in: employeeIds }, schoolId: user.schoolId },
    select: { id: true },
  })
  if (employees.length !== new Set(employeeIds).size) {
    throw badRequest('One or more employees are not on your staff list')
  }

  const saved = await db.$transaction(async tx => {
    await tx.staffAttendance.deleteMany({
      where: { schoolId: user.schoolId, date: body.date, employeeId: { in: employeeIds } },
    })
    await tx.staffAttendance.createMany({
      data: body.records.map(r => ({
        schoolId: user.schoolId, employeeId: r.employeeId,
        date: body.date, status: r.status,
        checkIn: r.checkIn || null, checkOut: r.checkOut || null,
        remarks: r.remarks || null,
      })),
    })
    return body.records.length
  })

  const counts = body.records.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {})
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${STATUS_LABELS[k] ?? k}`).join(', ')
  audit({ action: 'UPDATE', entity: 'StaffAttendance', summary: `Saved staff register for ${body.date} — ${summary}` })
  return { saved, counts }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
