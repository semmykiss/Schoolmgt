import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { paymentCreateSchema } from '@/lib/validation/fees'
import { balanceOf, computeStatus, allocateToInstalments } from '@/lib/domain/fees'
import { extractSeq } from '@/lib/domain/numbering'

export const GET = createHandler({ permission: 'fees.read' }, async ({ user, params }) => {
  const invoiceId = params.id
  const invoice = await db.feeInvoice.findFirst({ where: { id: invoiceId, schoolId: user.schoolId }, select: { id: true } })
  if (!invoice) throw notFound('Invoice not found')
  const payments = await db.payment.findMany({ where: { invoiceId }, orderBy: { createdAt: 'desc' } })
  return { items: payments }
})

/**
 * Record a payment against an invoice — atomic:
 *   payment row → invoice amountPaid/status → instalment allocation → income ledger entry.
 */
export const POST = createHandler({ permission: 'fees.write', body: paymentCreateSchema }, async ({ user, params, body, audit }) => {
  const invoiceId = params.id
  const invoice = await db.feeInvoice.findFirst({ where: { id: invoiceId, schoolId: user.schoolId } })
  if (!invoice) throw notFound('Invoice not found')
  if (invoice.status === 'VOID') throw badRequest('Cannot record a payment against a void invoice')

  const balance = balanceOf(invoice.total, invoice.amountPaid)
  if (balance === 0) throw badRequest('This invoice is already fully paid')
  if (body.amount > balance) {
    throw badRequest(`Amount exceeds the outstanding balance of ₦${(balance / 100).toLocaleString('en-NG')}`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const year = body.paidAt.slice(0, 4)
  const rows = await db.payment.findMany({
    where: { schoolId: user.schoolId, receiptNumber: { contains: `-${year}-` } },
    select: { receiptNumber: true },
  })
  let seq = rows.reduce((max, r) => Math.max(max, extractSeq(r.receiptNumber)), 0)
  seq += 1
  const receiptNumberStr = `RCP-${year}-${String(seq).padStart(6, '0')}`

  const result = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: {
      schoolId: user.schoolId,
      invoiceId,
      receiptNumber: receiptNumberStr,
      amount: body.amount,
      method: body.method,
      reference: body.reference?.trim() || null,
      paidAt: body.paidAt,
      note: body.note?.trim() || null,
      recordedById: user.id,
    } })

    const amountPaid = invoice.amountPaid + body.amount
    const status = computeStatus({
      total: invoice.total, amountPaid, dueDate: invoice.dueDate, today, current: invoice.status as never,
    })
    await tx.feeInvoice.update({ where: { id: invoiceId }, data: { amountPaid, status } })

    // Allocate across instalments (oldest unpaid first) when the invoice has them.
    const instalments = await tx.invoiceInstalment.findMany({ where: { invoiceId }, orderBy: { dueDate: 'asc' } })
    if (instalments.length) {
      for (const alloc of allocateToInstalments(instalments, body.amount)) {
        await tx.invoiceInstalment.update({
          where: { id: alloc.id },
          data: { paidAmount: { increment: alloc.add }, paidAt: body.paidAt },
        })
      }
    }

    await tx.ledgerEntry.create({ data: {
      schoolId: user.schoolId,
      type: 'INCOME',
      category: 'TUITION',
      description: `Fee payment — ${invoice.invoiceNumber}`,
      amount: body.amount,
      date: body.paidAt,
      source: 'FEE',
      referenceType: 'Payment',
      referenceId: payment.id,
      recordedById: user.id,
    } })

    return payment
  })

  audit({
    action: 'CREATE', entity: 'Payment', entityId: result.id,
    summary: `Receipt ${receiptNumberStr} — ₦${(body.amount / 100).toLocaleString('en-NG')} on ${invoice.invoiceNumber}`,
  })
  return result
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
