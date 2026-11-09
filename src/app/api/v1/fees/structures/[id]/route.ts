import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { feeStructureUpdateSchema } from '@/lib/validation/fees'
import { subtotalOf } from '@/lib/domain/fees'

export const PATCH = createHandler({ permission: 'fees.write', body: feeStructureUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = params.id
  const existing = await db.feeStructure.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Fee structure not found')

  if (body.termId || body.sessionId) {
    const termId = body.termId ?? existing.termId
    const sessionId = body.sessionId ?? existing.sessionId
    const term = await db.term.findFirst({ where: { id: termId, schoolId: user.schoolId }, select: { sessionId: true } })
    if (!term) throw notFound('Selected term does not exist')
    if (term.sessionId !== sessionId) throw badRequest('Selected term does not belong to that session')
  }
  if (body.classId) {
    const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId }, select: { id: true } })
    if (!cls) throw notFound('Selected class does not exist')
  }
  if (body.name && body.name !== existing.name) {
    const clash = await db.feeStructure.findFirst({ where: { schoolId: user.schoolId, name: body.name, id: { not: id } }, select: { id: true } })
    if (clash) throw badRequest('A fee structure with that name already exists')
  }

  const items = body.items ? JSON.stringify(body.items) : undefined
  const updated = await db.feeStructure.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      classId: body.classId,
      termId: body.termId,
      sessionId: body.sessionId,
      ...(items ? { items, totalAmount: subtotalOf(body.items!) } : {}),
      isActive: body.isActive,
    },
  })
  audit({ action: 'UPDATE', entity: 'FeeStructure', entityId: id, summary: `Updated fee structure "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'fees.write' }, async ({ user, params, audit }) => {
  const id = params.id
  const existing = await db.feeStructure.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Fee structure not found')

  const invoiceCount = await db.feeInvoice.count({ where: { schoolId: user.schoolId, feeStructureId: id } })
  if (invoiceCount > 0) {
    // Keep referential history — deactivate instead of hard delete.
    const updated = await db.feeStructure.update({ where: { id }, data: { isActive: false } })
    audit({ action: 'UPDATE', entity: 'FeeStructure', entityId: id, summary: `Deactivated fee structure "${existing.name}" (in use by ${invoiceCount} invoices)` })
    return { deactivated: true, invoiceCount }
  }

  await db.feeStructure.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'FeeStructure', entityId: id, summary: `Deleted fee structure "${existing.name}"` })
  return { deleted: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
