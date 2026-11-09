import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { salaryStructureCreateSchema } from '@/lib/validation/hr'
import { computePayslip, parseSalaryLines } from '@/lib/domain/hr'

/** GET /hr/salary-structures — list (?employeeId= to scope to one employee). */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const employeeId = query.get('employeeId')
  if (employeeId) where.employeeId = employeeId

  const [rows, total] = await Promise.all([
    db.salaryStructure.findMany({
      where,
      include: {
        employee: { select: { staffCode: true, firstName: true, lastName: true, position: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { effectiveFrom: 'desc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.salaryStructure.count({ where }),
  ])

  const items = rows.map(s => {
    const allowances = parseSalaryLines(s.allowances)
    const deductions = parseSalaryLines(s.deductions)
    const calc = computePayslip({ basicAmount: s.basicAmount, allowances, deductions })
    return {
      ...s,
      allowances,
      deductions,
      gross: calc.gross,
      net: calc.net,
      employeeName: `${s.employee.firstName} ${s.employee.lastName}`,
    }
  })
  return paginated(items, total, q)
})

/**
 * POST /hr/salary-structures — attach a pay scale to an employee. Activating
 * a structure deactivates the employee's previous one (history preserved).
 */
export const POST = createHandler({ permission: 'hr.salaries.write', body: salaryStructureCreateSchema }, async ({ user, body, audit }) => {
  const employee = await db.employee.findFirst({
    where: { id: body.employeeId, schoolId: user.schoolId, status: 'ACTIVE' },
  })
  if (!employee) throw notFound('Active staff member not found')

  const created = await db.$transaction(async tx => {
    if (body.isActive) {
      await tx.salaryStructure.updateMany({
        where: { schoolId: user.schoolId, employeeId: employee.id, isActive: true },
        data: { isActive: false },
      })
    }
    return tx.salaryStructure.create({
      data: {
        schoolId: user.schoolId,
        employeeId: employee.id,
        name: body.name,
        basicAmount: body.basicAmount,
        allowances: JSON.stringify(body.allowances),
        deductions: JSON.stringify(body.deductions),
        effectiveFrom: body.effectiveFrom,
        isActive: body.isActive,
      },
    })
  })

  audit({ action: 'create', entity: 'SalaryStructure', entityId: created.id, summary: `Salary structure "${body.name}" for ${employee.firstName} ${employee.lastName}` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
