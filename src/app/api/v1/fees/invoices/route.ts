import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { invoiceCreateSchema } from '@/lib/validation/fees'
import { subtotalOf, totalOf, computeStatus } from '@/lib/domain/fees'
import { extractSeq } from '@/lib/domain/numbering'

export const GET = createHandler({ permission: 'fees.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const status = query.get('status')
  const termId = query.get('termId')
  const sessionId = query.get('sessionId')
  const classId = query.get('classId')
  const studentId = query.get('studentId')
  if (status) where.status = status
  if (termId) where.termId = termId
  if (sessionId) where.sessionId = sessionId
  if (studentId) where.studentId = studentId
  if (classId) where.student = { classId }
  if (q.search) {
    where.OR = [
      { invoiceNumber: { contains: q.search } },
      { student: { firstName: { contains: q.search } } },
      { student: { lastName: { contains: q.search } } },
      { student: { admissionNumber: { contains: q.search } } },
    ]
  }

  const [items, total, counts] = await Promise.all([
    db.feeInvoice.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { id: true, name: true } } } },
        _count: { select: { payments: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: q.skip, take: q.take,
    }),
    db.feeInvoice.count({ where }),
    db.feeInvoice.groupBy({ by: ['status'], where: { schoolId: user.schoolId }, _count: { _all: true } }),
  ])
  return { ...paginated(items, total, q), counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) }
})

export const POST = createHandler({ permission: 'fees.write', body: invoiceCreateSchema }, async ({ user, body, audit }) => {
  const [student, term] = await Promise.all([
    db.student.findFirst({ where: { id: body.studentId, schoolId: user.schoolId }, select: { id: true, firstName: true, lastName: true } }),
    db.term.findFirst({ where: { id: body.termId, schoolId: user.schoolId }, select: { id: true, sessionId: true } }),
  ])
  if (!student) throw notFound('Selected student does not exist')
  if (!term) throw notFound('Selected term does not exist')
  if (term.sessionId !== body.sessionId) throw badRequest('Selected term does not belong to that session')

  const subtotal = subtotalOf(body.items)
  const discountAmount = Math.min(body.discountAmount, subtotal)
  const total = totalOf(body.items, discountAmount)
  const today = new Date().toISOString().slice(0, 10)

  const rows = await db.feeInvoice.findMany({
    where: { schoolId: user.schoolId, invoiceNumber: { contains: `-${today.slice(0, 4)}-` } },
    select: { invoiceNumber: true },
  })
  const seq = rows.reduce((max, r) => Math.max(max, extractSeq(r.invoiceNumber)), 0) + 1
  const invoiceNumberStr = `INV-${today.slice(0, 4)}-${String(seq).padStart(6, '0')}`

  const created = await db.feeInvoice.create({ data: {
    schoolId: user.schoolId,
    invoiceNumber: invoiceNumberStr,
    studentId: body.studentId,
    termId: body.termId,
    sessionId: body.sessionId,
    feeStructureId: body.feeStructureId ?? null,
    items: JSON.stringify(body.items),
    subtotal,
    discountAmount,
    total,
    amountPaid: 0,
    status: computeStatus({ total, amountPaid: 0, dueDate: body.dueDate, today }),
    dueDate: body.dueDate,
    notes: body.notes?.trim() || null,
    createdById: user.id,
  } })
  audit({ action: 'CREATE', entity: 'FeeInvoice', entityId: created.id, summary: `Raised invoice ${invoiceNumberStr} for ${student.firstName} ${student.lastName}` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
