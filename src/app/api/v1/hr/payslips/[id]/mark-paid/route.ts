import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { notifyUsers } from '@/lib/api/notify'
import { periodLabel } from '@/lib/domain/hr'

/**
 * PATCH /hr/payslips/:id/mark-paid — settle a DRAFT payslip and post the net
 * amount to the ledger as a SALARIES expense (source PAYROLL). Idempotent:
 * marking an already-paid slip is a no-op that never double-posts.
 */
export const PATCH = createHandler({ permission: 'hr.payroll.settle' }, async ({ user, params, audit }) => {
  const payslip = await db.payslip.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { employee: { select: { firstName: true, lastName: true, staffCode: true, userId: true } } },
  })
  if (!payslip) throw notFound('Payslip not found')
  const name = `${payslip.employee.firstName} ${payslip.employee.lastName}`

  if (payslip.status === 'PAID') return payslip // idempotent

  const today = new Date().toISOString().slice(0, 10)
  const updated = await db.$transaction(async tx => {
    const slip = await tx.payslip.update({
      where: { id: payslip.id },
      data: { status: 'PAID', paidAt: today },
    })
    await tx.ledgerEntry.create({
      data: {
        schoolId: user.schoolId,
        type: 'EXPENSE',
        category: 'SALARIES',
        description: `Salaries — ${name} · ${periodLabel(payslip.period)}`,
        amount: payslip.netAmount,
        date: today,
        source: 'PAYROLL',
        referenceType: 'Payslip',
        referenceId: payslip.id,
        recordedById: user.id,
      },
    })
    return slip
  })

  audit({
    action: 'update',
    entity: 'Payslip',
    entityId: updated.id,
    summary: `Marked ${periodLabel(updated.period)} payslip for ${name} as paid (₦${(updated.netAmount / 100).toLocaleString('en-NG')})`,
  })

  // Tell the staff member their salary has landed (in-app, if they have a login).
  if (payslip.employee.userId) {
    await notifyUsers(user.schoolId, [payslip.employee.userId], {
      title: `Salary paid — ${periodLabel(updated.period)}`,
      body: `Net pay ₦${(updated.netAmount / 100).toLocaleString('en-NG')} has been settled. View the payslip breakdown in Self-Service.`,
      type: 'PAYROLL',
      link: '#/self-service',
    })
  }

  return updated
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
