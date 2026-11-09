import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { forbidden, notFound } from '@/lib/api/errors'
import { childrenOfUser, currentTerm, studentPortalSummary, isoToday } from '@/lib/api/portal'

/**
 * GET /portal/child/:studentId — parent drill-in for one child.
 * Verifies the guardian link, then returns the full portal summary plus
 * invoice/payment history, recent attendance marks and all published report cards.
 */
export const GET = createHandler({ permission: 'portal', roles: ['PARENT', 'STUDENT'] }, async ({ user, params }) => {
  const { studentId } = params

  // STUDENT may only drill into themselves; PARENT only their children
  const allowed =
    user.role === 'PARENT'
      ? (await childrenOfUser(user.schoolId, user.id)).some(s => s.id === studentId)
      : (await db.student.findFirst({ where: { schoolId: user.schoolId, userId: user.id, id: studentId } })) != null
  if (!allowed) throw forbidden('You can only view your own child\'s records')

  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId },
    include: {
      class: { select: { id: true, name: true, level: true } },
      section: { select: { id: true, name: true } },
    },
  })
  if (!student) throw notFound('Student not found')

  const term = await currentTerm(user.schoolId)
  const today = isoToday()

  const [summary, invoices, payments, recentAttendance, reportCards] = await Promise.all([
    studentPortalSummary(user.schoolId, student, term, user.role),
    db.feeInvoice.findMany({
      where: { schoolId: user.schoolId, studentId, status: { not: 'VOID' } },
      orderBy: { dueDate: 'desc' },
      select: {
        id: true, invoiceNumber: true, termId: true, total: true, amountPaid: true,
        status: true, dueDate: true,
      },
      take: 12,
    }),
    db.payment.findMany({
      where: { invoice: { studentId, schoolId: user.schoolId } },
      orderBy: { paidAt: 'desc' },
      select: { id: true, amount: true, method: true, paidAt: true, reference: true, invoice: { select: { invoiceNumber: true } } },
      take: 8,
    }),
    db.studentAttendance.findMany({
      where: { schoolId: user.schoolId, studentId, periodId: null },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, status: true, remarks: true },
      take: 20,
    }),
    db.reportCard.findMany({
      where: { schoolId: user.schoolId, studentId, published: true, exam: { publishResults: true } },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true, totalScore: true, average: true, position: true, grade: true,
        teacherRemark: true, principalRemark: true, generatedAt: true,
        exam: { select: { id: true, name: true } },
      },
      take: 8,
    }),
  ])

  return {
    summary,
    invoices: invoices.map(inv => ({
      ...inv,
      balance: Math.max(0, inv.total - Math.max(0, inv.amountPaid)),
      isOverdue: inv.dueDate < today && inv.amountPaid < inv.total,
    })),
    payments,
    recentAttendance,
    reportCards,
  }
})
