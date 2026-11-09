import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'
import { payslipGenerateSchema } from '@/lib/validation/hr'
import { computePayslip, periodLabel } from '@/lib/domain/hr'

/**
 * POST /hr/payslips/generate — batch-create DRAFT payslips for {period} from
 * every ACTIVE employee's active salary structure. Employees already having a
 * payslip for the period are skipped (idempotent re-runs are safe).
 */
export const POST = createHandler({ permission: 'hr.write', body: payslipGenerateSchema }, async ({ user, body, audit }) => {
  const { period } = body

  const employees = await db.employee.findMany({
    where: { schoolId: user.schoolId, status: 'ACTIVE' },
    include: { salaryStructures: { where: { isActive: true }, take: 1 } },
  })
  const withStructure = employees.filter(e => e.salaryStructures[0])
  if (withStructure.length === 0) {
    throw badRequest('No active staff member has an active salary structure — set one up first')
  }

  const existing = await db.payslip.findMany({
    where: { schoolId: user.schoolId, period },
    select: { employeeId: true },
  })
  const already = new Set(existing.map(p => p.employeeId))

  const rows = withStructure
    .filter(e => !already.has(e.id))
    .map(e => {
      const s = e.salaryStructures[0]
      const calc = computePayslip({
        basicAmount: s.basicAmount,
        allowances: JSON.parse(s.allowances) as { label: string; amount: number }[],
        deductions: JSON.parse(s.deductions) as { label: string; amount: number }[],
      })
      return {
        schoolId: user.schoolId,
        employeeId: e.id,
        period,
        grossAmount: calc.gross,
        totalDeductions: calc.totalDeductions,
        netAmount: calc.net,
        items: JSON.stringify(calc.items),
        createdById: user.id,
      }
    })

  await db.payslip.createMany({ data: rows })

  audit({
    action: 'create',
    entity: 'Payslip',
    summary: `Generated ${rows.length} payslip(s) for ${periodLabel(period)} (${already.size} already existed)`,
  })
  return { period, created: rows.length, skipped: already.size }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
