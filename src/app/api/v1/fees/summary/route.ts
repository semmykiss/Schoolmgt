import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery } from '@/lib/api/paginate'

/**
 * Collection overview for the Fees module:
 * billed / collected / outstanding for a term + status counts + defaulters
 * (students with the largest unpaid balances) + recent payments.
 */
export const GET = createHandler({ permission: 'fees.read' }, async ({ user, query }) => {
  const termId = query.get('termId')
  const sessionId = query.get('sessionId')
  const where: Record<string, unknown> = { schoolId: user.schoolId, status: { not: 'VOID' } }
  if (termId) where.termId = termId
  if (sessionId) where.sessionId = sessionId

  const invoices = await db.feeInvoice.findMany({
    where,
    select: {
      id: true, total: true, amountPaid: true, dueDate: true, status: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
    },
  })

  const billed = invoices.reduce((s, i) => s + i.total, 0)
  const collected = invoices.reduce((s, i) => s + i.amountPaid, 0)
  const outstanding = billed - collected
  const statusCounts: Record<string, number> = {}
  for (const i of invoices) statusCounts[i.status] = (statusCounts[i.status] ?? 0) + 1

  const defaulters = invoices
    .map(i => ({ ...i, balance: i.total - i.amountPaid }))
    .filter(i => i.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)
    .map(({ id, total, amountPaid, balance, dueDate, student }) => ({
      invoiceId: id, student, total, amountPaid, balance, dueDate,
    }))

  const recentPayments = await db.payment.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  const q = parseListQuery(query)
  return { billed, collected, outstanding, invoiceCount: invoices.length, statusCounts, defaulters, recentPayments, page: q.page }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
