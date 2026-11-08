import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { balanceOf, computeStatus } from '@/lib/domain/fees'

/** Reverse a mistaken payment — restores the invoice balance and removes the linked ledger entry. */
export const DELETE = createHandler({ permission: 'fees.write' }, async ({ user, params, audit }) => {
  const { id: invoiceId, paymentId } = params
  const invoice = await db.feeInvoice.findFirst({ where: { id: invoiceId, schoolId: user.schoolId } })
  if (!invoice) throw notFound('Invoice not found')
  const payment = await db.payment.findFirst({ where: { id: paymentId, invoiceId, schoolId: user.schoolId } })
  if (!payment) throw notFound('Payment not found')

  const amountPaid = invoice.amountPaid - payment.amount
  if (amountPaid < 0) throw badRequest('Reversal would make the paid amount negative')

  const today = new Date().toISOString().slice(0, 10)
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } })
    await tx.feeInvoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid,
        status: computeStatus({
          total: invoice.total, amountPaid, dueDate: invoice.dueDate, today, current: invoice.status as never,
        }),
      },
    })
    await tx.ledgerEntry.deleteMany({ where: { schoolId: user.schoolId, referenceType: 'Payment', referenceId: payment.id } })
  })

  audit({
    action: 'DELETE', entity: 'Payment', entityId: payment.id,
    summary: `Reversed receipt ${payment.receiptNumber} on ${invoice.invoiceNumber} (₦${(payment.amount / 100).toLocaleString('en-NG')})`,
  })
  return { reversed: true, amountPaid, balance: balanceOf(invoice.total, amountPaid) }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
