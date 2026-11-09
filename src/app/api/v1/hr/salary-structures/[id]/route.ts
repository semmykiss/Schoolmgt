import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { salaryStructureUpdateSchema } from '@/lib/validation/hr'

/** PATCH /hr/salary-structures/:id — edit or activate/deactivate (activating demotes siblings). */
export const PATCH = createHandler({ permission: 'hr.salaries.write', body: salaryStructureUpdateSchema }, async ({ user, params, body, audit }) => {
  const structure = await db.salaryStructure.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { employee: { select: { firstName: true, lastName: true } } },
  })
  if (!structure) throw notFound('Salary structure not found')

  const updated = await db.$transaction(async tx => {
    if (body.isActive === true) {
      await tx.salaryStructure.updateMany({
        where: { schoolId: user.schoolId, employeeId: structure.employeeId, isActive: true, id: { not: structure.id } },
        data: { isActive: false },
      })
    }
    return tx.salaryStructure.update({
      where: { id: structure.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.basicAmount !== undefined && { basicAmount: body.basicAmount }),
        ...(body.allowances !== undefined && { allowances: JSON.stringify(body.allowances) }),
        ...(body.deductions !== undefined && { deductions: JSON.stringify(body.deductions) }),
        ...(body.effectiveFrom !== undefined && { effectiveFrom: body.effectiveFrom }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    })
  })

  audit({
    action: 'update',
    entity: 'SalaryStructure',
    entityId: updated.id,
    summary: `Updated salary structure "${updated.name}" for ${structure.employee.firstName} ${structure.employee.lastName}`,
  })
  return updated
})

/** DELETE /hr/salary-structures/:id — payslips already generated keep their snapshot. */
export const DELETE = createHandler({ permission: 'hr.salaries.write' }, async ({ user, params, audit }) => {
  const structure = await db.salaryStructure.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { employee: { select: { firstName: true, lastName: true } } },
  })
  if (!structure) throw notFound('Salary structure not found')

  await db.salaryStructure.delete({ where: { id: structure.id } })
  audit({
    action: 'delete',
    entity: 'SalaryStructure',
    entityId: structure.id,
    summary: `Deleted salary structure "${structure.name}" for ${structure.employee.firstName} ${structure.employee.lastName}`,
  })
  return { deleted: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
