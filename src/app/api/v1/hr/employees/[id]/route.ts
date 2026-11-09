import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { employeeUpdateSchema } from '@/lib/validation/hr'
import { computePayslip, parseSalaryLines } from '@/lib/domain/hr'

/**
 * GET /hr/employees/:id — full staff profile: linked login, every salary
 * structure (with computed gross/net), recent payslips and leave requests.
 */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, params }) => {
  const employee = await db.employee.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      user: { select: { id: true, email: true, role: true, status: true, lastLoginAt: true } },
      salaryStructures: { orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }] },
      payslips: { orderBy: { period: 'desc' }, take: 12 },
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!employee) throw notFound('Staff member not found')

  return {
    ...employee,
    fullName: `${employee.firstName} ${employee.lastName}`,
    salaryStructures: employee.salaryStructures.map(s => {
      const calc = computePayslip({
        basicAmount: s.basicAmount,
        allowances: parseSalaryLines(s.allowances),
        deductions: parseSalaryLines(s.deductions),
      })
      return { ...s, allowances: parseSalaryLines(s.allowances), deductions: parseSalaryLines(s.deductions), gross: calc.gross, net: calc.net }
    }),
  }
})

/** PATCH /hr/employees/:id — update profile/employment fields. */
export const PATCH = createHandler({ permission: 'hr.employees.write', body: employeeUpdateSchema }, async ({ user, params, body, audit }) => {
  const employee = await db.employee.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!employee) throw notFound('Staff member not found')

  if (body.email) {
    const dup = await db.employee.findFirst({
      where: { schoolId: user.schoolId, email: body.email.trim().toLowerCase(), status: { not: 'LEFT' }, id: { not: employee.id } },
    })
    if (dup) throw conflict('Another active staff member already uses this email')
  }

  const updated = await db.employee.update({
    where: { id: employee.id },
    data: {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.gender !== undefined && { gender: body.gender || null }),
      ...(body.dateOfBirth !== undefined && { dateOfBirth: body.dateOfBirth || null }),
      ...(body.email !== undefined && { email: body.email ? body.email.trim().toLowerCase() : null }),
      ...(body.phone !== undefined && { phone: body.phone || null }),
      ...(body.position !== undefined && { position: body.position }),
      ...(body.department !== undefined && { department: body.department || null }),
      ...(body.qualification !== undefined && { qualification: body.qualification || null }),
      ...(body.employmentDate !== undefined && { employmentDate: body.employmentDate }),
      ...(body.employmentType !== undefined && { employmentType: body.employmentType }),
      ...(body.status !== undefined && { status: body.status }),
    },
  })
  audit({ action: 'update', entity: 'Employee', entityId: updated.id, summary: `Updated staff ${updated.firstName} ${updated.lastName}` })
  return updated
})

/**
 * DELETE /hr/employees/:id — archive (soft-delete). Historical payslips,
 * leave records and timetable links must survive, so the record is marked
 * LEFT rather than destroyed.
 */
export const DELETE = createHandler({ permission: 'hr.employees.write' }, async ({ user, params, audit }) => {
  const employee = await db.employee.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!employee) throw notFound('Staff member not found')

  const updated = await db.employee.update({
    where: { id: employee.id },
    data: { status: 'LEFT' },
  })
  audit({ action: 'delete', entity: 'Employee', entityId: updated.id, summary: `Archived staff ${updated.firstName} ${updated.lastName}` })
  return { archived: true, id: updated.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
