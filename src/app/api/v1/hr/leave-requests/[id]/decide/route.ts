import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { leaveDecisionSchema } from '@/lib/validation/hr'
import { LEAVE_TYPE_LABEL } from '@/lib/domain/hr'

/**
 * POST /hr/leave-requests/:id/decide — approve or reject a PENDING request.
 * The requester's linked login (if any) receives an in-app notification.
 */
export const POST = createHandler({ permission: 'hr.leave.write', body: leaveDecisionSchema }, async ({ user, params, body, audit }) => {
  const request = await db.leaveRequest.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { employee: { select: { firstName: true, lastName: true, userId: true } } },
  })
  if (!request) throw notFound('Leave request not found')
  if (request.status !== 'PENDING') throw conflict('This request has already been decided')

  const updated = await db.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: body.decision,
      decidedById: user.id,
      decidedAt: new Date(),
      note: body.note || null,
    },
  })

  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  if (request.employee.userId) {
    await db.notification.create({
      data: {
        schoolId: user.schoolId,
        userId: request.employee.userId,
        title: `Leave request ${body.decision === 'APPROVED' ? 'approved' : 'rejected'}`,
        body: `${LEAVE_TYPE_LABEL[request.type]} ${request.startDate} → ${request.endDate}${body.note ? ` — ${body.note}` : ''}`,
        type: 'LEAVE',
        link: '#/self-service',
      },
    })
  }

  audit({
    action: 'update',
    entity: 'LeaveRequest',
    entityId: updated.id,
    summary: `${body.decision === 'APPROVED' ? 'Approved' : 'Rejected'} ${employeeName}'s ${LEAVE_TYPE_LABEL[request.type]} (${request.startDate} → ${request.endDate})`,
  })
  return updated
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
