import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'

/** GET /hr/payslips/:id — single payslip with employee detail + parsed breakdown items. */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, params }) => {
  const payslip = await db.payslip.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
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
