import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { can } from '@/lib/auth/permissions'
import { employeeOfUser } from '@/lib/api/portal'

/**
 * GET /hr/payslips/:id — single payslip with employee detail + parsed breakdown
 * items. HR/payroll staff see any slip in their school; a staff member without
 * `hr.read` may only open their OWN payslips (self-service).
 */
export const GET = createHandler({}, async ({ user, params }) => {
  const manager = can(user.permissions, 'hr.read')
  let employeeId: string | undefined
  if (!manager) {
    const self = await employeeOfUser(user.schoolId, user.id)
    if (!self) throw notFound('Payslip not found')
    employeeId = self.id
  }

  const payslip = await db.payslip.findFirst({
    where: { id: params.id, schoolId: user.schoolId, ...(employeeId ? { employeeId } : {}) },
    include: {
      employee: {
        select: {
          staffCode: true, firstName: true, lastName: true, position: true,
          department: true, employmentType: true, email: true,
        },
      },
    },
  })
  if (!payslip) throw notFound('Payslip not found')

  let items: { label: string; amount: number; type: string }[] = []
  try {
    const parsed = JSON.parse(payslip.items)
    if (Array.isArray(parsed)) items = parsed
  } catch { /* keep empty */ }

  return {
    ...payslip,
    items,
    employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
