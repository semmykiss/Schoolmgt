import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { employeeCreateSchema } from '@/lib/validation/hr'
import { computePayslip, parseSalaryLines } from '@/lib/domain/hr'

/**
 * GET /hr/employees — full staff directory (HR module).
 * Filters: search (name/code/email/position), department, status, portal (linked|unlinked).
 * Each row carries the active salary structure's gross for quick scanning.
 */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { staffCode: { contains: q.search } },
      { email: { contains: q.search } },
      { position: { contains: q.search } },
    ]
  }
  const department = query.get('department')
  if (department) where.department = department
  const status = query.get('status')
  if (status) where.status = status
  const portal = query.get('portal')
  if (portal === 'linked') where.userId = { not: null }
  if (portal === 'unlinked') where.userId = null

  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, role: true, status: true } },
        salaryStructures: {
          where: { isActive: true },
          take: 1,
          select: { id: true, name: true, basicAmount: true, allowances: true, deductions: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.employee.count({ where }),
  ])

  const items = rows.map(e => {
    const structure = e.salaryStructures[0] ?? null
    const gross = structure
      ? computePayslip({
          basicAmount: structure.basicAmount,
          allowances: parseSalaryLines(structure.allowances),
          deductions: parseSalaryLines(structure.deductions),
        }).gross
      : null
    const { salaryStructures: _s, ...rest } = e
    return {
      ...rest,
      fullName: `${e.firstName} ${e.lastName}`,
      activeSalary: structure ? { id: structure.id, name: structure.name, gross } : null,
    }
  })
  return paginated(items, total, q)
})

/**
 * POST /hr/employees — onboard a staff member. Staff codes are auto-assigned
 * (STF-0001…) continuing the school's numbering.
 */
export const POST = createHandler({ permission: 'hr.write', body: employeeCreateSchema }, async ({ user, body, audit }) => {
  const existing = await db.employee.findMany({
    where: { schoolId: user.schoolId, staffCode: { startsWith: 'STF-' } },
    select: { staffCode: true },
  })
  const maxCode = existing.reduce((max, e) => {
    const n = Number(e.staffCode.slice(4))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  const staffCode = `STF-${String(maxCode + 1).padStart(4, '0')}`

  if (body.email) {
    const dup = await db.employee.findFirst({
      where: { schoolId: user.schoolId, email: body.email.trim().toLowerCase(), status: { not: 'LEFT' } },
    })
    if (dup) throw conflict('Another active staff member already uses this email')
  }

  const created = await db.employee.create({
    data: {
      schoolId: user.schoolId,
      staffCode,
      firstName: body.firstName,
      lastName: body.lastName,
      gender: body.gender || null,
      dateOfBirth: body.dateOfBirth || null,
      email: body.email ? body.email.trim().toLowerCase() : null,
      phone: body.phone || null,
      position: body.position,
      department: body.department || null,
      qualification: body.qualification || null,
      employmentDate: body.employmentDate,
      employmentType: body.employmentType,
      status: body.status,
    },
  })
  audit({ action: 'create', entity: 'Employee', entityId: created.id, summary: `Onboarded staff ${created.firstName} ${created.lastName} (${staffCode})` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
