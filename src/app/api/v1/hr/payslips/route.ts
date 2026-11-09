import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { periodOf } from '@/lib/domain/hr'

/**
 * GET /hr/payslips — payroll register for a period (?period=YYYY-MM, default current).
 * Filters: status (DRAFT|PAID), department, search (name/staff code).
 * Returns a summary block (gross/deductions/net totals + status counts) for the
 * current filter so the UI can render stat cards without a second request.
 */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }

  const period = query.get('period')
  where.period = period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : periodOf()
  const status = query.get('status')
  if (status) where.status = status

  const department = query.get('department')
  const search = q.search
  const employeeWhere: Record<string, unknown> = {
    ...(department ? { department } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { staffCode: { contains: search } },
          ],
        }
      : {}),
  }
  if (Object.keys(employeeWhere).length > 0) where.employee = employeeWhere

  const [rows, total, sums, statusGroups] = await Promise.all([
    db.payslip.findMany({
      where,
      include: {
        employee: { select: { staffCode: true, firstName: true, lastName: true, position: true, department: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
      skip: q.skip,
      take: q.take,
    }),
    db.payslip.count({ where }),
    db.payslip.aggregate({ where, _sum: { grossAmount: true, totalDeductions: true, netAmount: true } }),
    db.payslip.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ])

  const items = rows.map(p => ({
    ...p,
    employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
  }))

  return {
    ...paginated(items, total, q),
    summary: {
      gross: sums._sum.grossAmount ?? 0,
      deductions: sums._sum.totalDeductions ?? 0,
      net: sums._sum.netAmount ?? 0,
      paidCount: statusGroups.find(g => g.status === 'PAID')?._count._all ?? 0,
      draftCount: statusGroups.find(g => g.status === 'DRAFT')?._count._all ?? 0,
      employeeCount: total,
    },
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
