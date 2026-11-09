import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { studentExitSchema } from '@/lib/validation/admissions'

/** Record a transfer-out, graduation, suspension or withdrawal with exit metadata. */
export const POST = createHandler({ permission: 'students.exit', body: studentExitSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Student')
  const student = await db.student.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!student) throw notFound('Student not found')
  if (student.status !== 'ACTIVE') {
    throw notFound(`${student.firstName} is already marked ${student.status.toLowerCase()}`)
  }

  const unpaid = await db.feeInvoice.count({ where: { studentId: id, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } } })
  const note = unpaid > 0 ? ` — ⚠ ${unpaid} unpaid invoice(s) remain` : ''

  await db.student.update({
    where: { id },
    data: {
      status: body.status,
      exitDate: body.exitDate,
      exitReason: `${body.exitReason}${body.notes ? `: ${body.notes.trim()}` : ''}`,
    },
  })

  audit({
    action: 'UPDATE', entity: 'Student', entityId: id,
    summary: `Marked ${student.firstName} ${student.lastName} as ${body.status.toLowerCase()} (${body.exitReason})${note}`,
  })
  return { ok: true, unpaidInvoices: unpaid }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
