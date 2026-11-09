import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, forbidden, notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { leaveRequestCreateSchema } from '@/lib/validation/hr'
import { employeeOfUser } from '@/lib/api/portal'
import { can } from '@/lib/auth/permissions'
import { rangesOverlap, LEAVE_TYPE_LABEL } from '@/lib/domain/hr'

/**
 * GET /hr/leave-requests — leave register with filters (?status=, ?employeeId=).
 */
export const GET = createHandler({ permission: 'hr.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const status = query.get('status')
  if (status) where.status = status
  const employeeId = query.get('employeeId')
  if (employeeId) where.employeeId = employeeId

  const [rows, total] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      include: {
        employee: { select: { staffCode: true, firstName: true, lastName: true, position: true, department: true, userId: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.leaveRequest.count({ where }),
  ])

  const items = rows.map(r => ({
    ...r,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
  }))
  return paginated(items, total, q)
})

/**
 * POST /hr/leave-requests — file a leave request.
 *  - HR staff (hr.leave.write) may file on behalf of any employee (employeeId).
 *  - Any staff member with a linked employee profile may file for themselves
 *    (employeeId omitted) — powers the staff self-service flow.
 * Overlapping PENDING/APPROVED requests for the same employee are rejected.
 */
export const POST = createHandler({ body: leaveRequestCreateSchema }, async ({ user, body, audit }) => {
  const manager = can(user.permissions, 'hr.leave.write')

  let employeeId = body.employeeId?.trim() || ''
  if (employeeId && employeeId !== '__self__') {
    if (!manager) throw forbidden('You can only file leave requests for yourself')
    const target = await db.employee.findFirst({ where: { id: employeeId, schoolId: user.schoolId } })
    if (!target) throw notFound('Staff member not found')
  } else {
    const self = await employeeOfUser(user.schoolId, user.id)
    if (!self) {
      throw forbidden(
        manager
          ? 'Pick the staff member this request is for'
          : 'Your account is not linked to a staff profile — contact the school office',
      )
    }
    employeeId = self.id
  }

  const activeLeaves = await db.leaveRequest.findMany({
    where: {
      schoolId: user.schoolId,
      employeeId,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { startDate: true, endDate: true },
  })
  const clash = activeLeaves.find(l => rangesOverlap(
    { startDate: l.startDate, endDate: l.endDate },
    { startDate: body.startDate, endDate: body.endDate },
  ))
  if (clash) {
    throw conflict('These dates overlap an existing pending or approved leave for this staff member')
  }

  const created = await db.leaveRequest.create({
    data: {
      schoolId: user.schoolId,
      employeeId,
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason || null,
    },
  })
  audit({ action: 'create', entity: 'LeaveRequest', entityId: created.id, summary: `Filed ${LEAVE_TYPE_LABEL[body.type]} request (${body.startDate} → ${body.endDate})` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
