import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { forbidden } from '@/lib/api/errors'
import { employeeOfUser } from '@/lib/api/portal'
import { parseSalaryLines } from '@/lib/domain/hr'

/**
 * GET /hr/self — staff self-service bundle for any employee-linked login:
 * profile, own leave requests, own payslips (with the full salary breakdown)
 * and quick stats. No permission needed — the employee link is the scope.
 */
export const GET = createHandler({}, async ({ user }) => {
  const employee = await employeeOfUser(user.schoolId, user.id)
  if (!employee) {
    throw forbidden('Your account is not linked to a staff profile — contact the school office')
  }

  const [leaveRequests, payslips, structure] = await Promise.all([
    db.leaveRequest.findMany({
      where: { schoolId: user.schoolId, employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.payslip.findMany({
      where: { schoolId: user.schoolId, employeeId: employee.id },
      orderBy: { period: 'desc' },
      take: 24,
    }),
    db.salaryStructure.findFirst({
      where: { schoolId: user.schoolId, employeeId: employee.id, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    }),
  ])

  // Parse payslip breakdown items (basic + allowances − deductions)
  const slips = payslips.map(p => {
    let items: { label: string; amount: number; type: string }[] = []
    try {
      const parsed = JSON.parse(p.items)
      if (Array.isArray(parsed)) items = parsed
    } catch { /* keep empty */ }
    return { ...p, items }
  })

  // Stats: approved leave days taken this calendar year + pending count
  const year = new Date().getFullYear()
  const approvedDays = leaveRequests
    .filter(r => r.status === 'APPROVED' && r.startDate.startsWith(String(year)))
    .reduce((total, r) => {
      const a = new Date(`${r.startDate}T00:00:00`).getTime()
      const b = new Date(`${r.endDate}T00:00:00`).getTime()
      return total + (Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86_400_000) + 1 : 0)
    }, 0)

  return {
    employee: {
      id: employee.id,
      staffCode: employee.staffCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      position: employee.position,
      department: employee.department,
      employmentType: employee.employmentType,
      employmentDate: employee.employmentDate,
      email: employee.email,
      phone: employee.phone,
      photoUrl: employee.photoUrl,
    },
    structure: structure
      ? {
          name: structure.name,
          basicAmount: structure.basicAmount,
          allowances: parseSalaryLines(structure.allowances),
          deductions: parseSalaryLines(structure.deductions),
          effectiveFrom: structure.effectiveFrom,
        }
      : null,
    leaveRequests,
    payslips: slips,
    stats: {
      pendingLeave: leaveRequests.filter(r => r.status === 'PENDING').length,
      approvedLeaveDaysThisYear: approvedDays,
      payslipsThisYear: slips.filter(p => p.period.startsWith(String(year))).length,
    },
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
