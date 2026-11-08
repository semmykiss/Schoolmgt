import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { ledgerEntryUpdateSchema } from '@/lib/validation/fees'

function assertManual(existing: { source: string }) {
  if (existing.source !== 'MANUAL') {
    throw badRequest('System-generated entries (fee payments, payroll) cannot be edited — they follow their source document')
  }
}

export const PATCH = createHandler({ permission: 'accounts.write', body: ledgerEntryUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = params.id
  const existing = await db.ledgerEntry.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Ledger entry not found')
  assertManual(existing)

  const updated = await db.ledgerEntry.update({
    where: { id },
    data: {
      type: body.type,
      category: body.category,
      description: body.description?.trim(),
      amount: body.amount,
      date: body.date,
    },
  })
  audit({ action: 'UPDATE', entity: 'LedgerEntry', entityId: id, summary: `Updated ledger entry "${updated.description}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'accounts.write' }, async ({ user, params, audit }) => {
  const id = params.id
  const existing = await db.ledgerEntry.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!existing) throw notFound('Ledger entry not found')
  assertManual(existing)

  await db.ledgerEntry.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'LedgerEntry', entityId: id, summary: `Deleted ledger entry "${existing.description}"` })
  return { deleted: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
