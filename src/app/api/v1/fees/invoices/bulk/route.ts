import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { invoiceBulkSchema } from '@/lib/validation/fees'
import { computeStatus } from '@/lib/domain/fees'
import { extractSeq } from '@/lib/domain/numbering'
import { notifyUsers } from '@/lib/api/notify'

/**
 * Bulk-generate invoices for a class (optionally one section) from a fee
 * structure. Idempotent per term when skipExisting is on.
 */
export const POST = createHandler({ permission: 'fees.invoices.write', body: invoiceBulkSchema }, async ({ user, body, audit }) => {
  const structure = await db.feeStructure.findFirst({
    where: { id: body.feeStructureId, schoolId: user.schoolId, isActive: true },
  })
  if (!structure) throw notFound('Fee structure not found or inactive')

  const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId }, select: { id: true, name: true } })
  if (!cls) throw notFound('Selected class does not exist')
  if (structure.classId !== body.classId) throw badRequest(`That fee structure targets a different class (${structure.classId})`)

  const students = await db.student.findMany({
    where: {
      schoolId: user.schoolId, classId: body.classId,
      ...(body.sectionId ? { sectionId: body.sectionId } : {}),
      status: 'ACTIVE',
    },
    select: {
      id: true, firstName: true, lastName: true,
      userId: true,
      guardians: { select: { guardian: { select: { userId: true } } } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  if (students.length === 0) throw badRequest('No active students found for that selection')

  const existingInvoices = await db.feeInvoice.findMany({
    where: { schoolId: user.schoolId, termId: structure.termId, sessionId: structure.sessionId },
    select: { studentId: true, status: true },
  })
  const skipper = new Set(
    body.skipExisting
      ? existingInvoices.filter(i => i.status !== 'VOID').map(i => i.studentId)
      : [],
  )
  const targets = students.filter(s => !skipper.has(s.id))
  if (targets.length === 0) {
    return { created: 0, skipped: students.length, message: 'Every student already has an invoice for this term' }
  }

  const today = new Date().toISOString().slice(0, 10)
  const year = today.slice(0, 4)
  const rows = await db.feeInvoice.findMany({
    where: { schoolId: user.schoolId, invoiceNumber: { contains: `-${year}-` } },
    select: { invoiceNumber: true },
  })
  let seq = rows.reduce((max, r) => Math.max(max, extractSeq(r.invoiceNumber)), 0)

  const items = JSON.parse(structure.items) as { label: string; amount: number }[]
  const created: string[] = []
  for (const student of targets) {
    seq += 1
    const invoiceNumberStr = `INV-${year}-${String(seq).padStart(6, '0')}`
    const inv = await db.feeInvoice.create({ data: {
      schoolId: user.schoolId,
      invoiceNumber: invoiceNumberStr,
      studentId: student.id,
      termId: structure.termId,
      sessionId: structure.sessionId,
      feeStructureId: structure.id,
      items: structure.items,
      subtotal: structure.totalAmount,
      discountAmount: 0,
      total: structure.totalAmount,
      amountPaid: 0,
      status: computeStatus({ total: structure.totalAmount, amountPaid: 0, dueDate: body.dueDate, today }),
      dueDate: body.dueDate,
      createdById: user.id,
    } })
    created.push(inv.invoiceNumber)
  }

  audit({
    action: 'BULK_CREATE', entity: 'FeeInvoice',
    summary: `Generated ${created.length} invoice(s) from "${structure.name}" for ${cls.name}`,
  })

  // One heads-up per affected portal circle (student + guardians, deduped).
  const circle = new Set<string>()
  for (const s of targets) {
    if (s.userId) circle.add(s.userId)
    for (const g of s.guardians) if (g.guardian.userId) circle.add(g.guardian.userId)
  }
  await notifyUsers(user.schoolId, circle, {
    title: `New school fees invoice — ${cls.name}`,
    body: `₦${(structure.totalAmount / 100).toLocaleString('en-NG')} due ${body.dueDate}, from "${structure.name}". View details on the portal.`,
    type: 'FEE',
    link: '#/portal',
  })

  return {
    created: created.length,
    skipped: students.length - targets.length,
    invoiceNumbers: created,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
