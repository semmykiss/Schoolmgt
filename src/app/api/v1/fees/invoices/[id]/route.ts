import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { invoiceUpdateSchema } from '@/lib/validation/fees'
import { subtotalOf, totalOf, computeStatus, balanceOf, parseItems } from '@/lib/domain/fees'

export const GET = createHandler({ permission: 'fees.read' }, async ({ user, params }) => {
  const id = params.id
  const invoice = await db.feeInvoice.findFirst({
    where: { id, schoolId: user.schoolId },
    include: {
      student: {
        select: {
          id: true, firstName: true, lastName: true, otherName: true, admissionNumber: true,
          class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } },
          guardians: { select: { guardian: { select: { id: true, firstName: true, lastName: true, phone: true, relationship: true } } } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!invoice) throw notFound('Invoice not found')
  const [term, discounts] = await Promise.all([
    db.term.findFirst({ where: { id: invoice.termId }, select: { name: true } }),
    db.discount.findMany({ where: { schoolId: user.schoolId, studentId: invoice.studentId, active: true } }),
  ])
  const balance = balanceOf(invoice.total, invoice.amountPaid)
  const { guardians, ...student } = invoice.student
  return {
    ...invoice,
    student: {
      ...student,
      guardians: guardians.map(g => g.guardian),
    },
    term,
    balance,
    discounts,
  }
})

export const PATCH = createHandler({ permission: 'fees.write', body: invoiceUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = params.id
  const existing = await db.feeInvoice.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Invoice not found')

  const items = body.items ? JSON.stringify(body.items) : undefined
  const subtotal = body.items ? subtotalOf(body.items) : undefined
  const discountAmount = body.discountAmount !== undefined
    ? Math.min(body.discountAmount, subtotal ?? existing.subtotal)
    : undefined
  const total = (body.items || body.discountAmount !== undefined)
    ? totalOf(body.items ?? parseItems(existing.items), discountAmount ?? existing.discountAmount)
    : undefined
  const today = new Date().toISOString().slice(0, 10)
  const status = body.status ?? (total !== undefined
    ? computeStatus({ total, amountPaid: existing.amountPaid, dueDate: body.dueDate ?? existing.dueDate, today, current: existing.status as never })
    : undefined)
  if (status === 'PAID' && existing.amountPaid < (total ?? existing.total)) {
    throw badRequest('Cannot mark the invoice paid while the balance is outstanding — record a payment instead')
  }

  const updated = await db.feeInvoice.update({
    where: { id },
    data: {
      ...(items ? { items, subtotal } : {}),
      ...(discountAmount !== undefined ? { discountAmount } : {}),
      ...(total !== undefined ? { total } : {}),
      dueDate: body.dueDate,
      notes: body.notes === '' ? null : body.notes,
      ...(body.status ? { status } : status ? { status } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'FeeInvoice', entityId: id, summary: `Updated invoice ${existing.invoiceNumber}` })
  return updated
})

/** Void an invoice (soft state change so payment history stays intact). */
export const DELETE = createHandler({ permission: 'fees.write' }, async ({ user, params, audit }) => {
  const id = params.id
  const existing = await db.feeInvoice.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Invoice not found')
  if (existing.status === 'VOID') throw badRequest('Invoice is already void')
  if (existing.amountPaid > 0) {
    throw badRequest('Invoice has recorded payments — reverse them before voiding')
  }

  const updated = await db.feeInvoice.update({ where: { id }, data: { status: 'VOID' } })
  audit({ action: 'VOID', entity: 'FeeInvoice', entityId: id, summary: `Voided invoice ${existing.invoiceNumber}` })
  return updated
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
