/** One-off cleanup of E2E test artifacts (leave requests, notifications, payment, payslip revert). */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // 1. E2E leave requests
  const lr = await db.leaveRequest.deleteMany({ where: { reason: { contains: 'E2E' } } })
  console.log(`deleted ${lr.count} E2E leave request(s)`)

  // 2. Revert Tunde's current-month payslip (marked paid during E2E) → DRAFT
  const tunde = await db.employee.findFirst({ where: { staffCode: 'STF-003' } })
  if (tunde) {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const slip = await db.payslip.findFirst({ where: { employeeId: tunde.id, period, status: 'PAID' } })
    if (slip) {
      await db.ledgerEntry.deleteMany({ where: { referenceType: 'Payslip', referenceId: slip.id } })
      await db.payslip.update({ where: { id: slip.id }, data: { status: 'DRAFT', paidAt: null } })
      console.log(`reverted ${period} payslip for STF-003 to DRAFT (+ ledger entry removed)`)
    }
  }

  // 3. Reverse the E2E receipt payment (full-balance payment on an invoice)
  const pay = await db.payment.findFirst({ where: { receiptNumber: { contains: '-000041' } } })
  if (pay) {
    const inv = await db.feeInvoice.findUnique({ where: { id: pay.invoiceId } })
    if (inv) {
      const amountPaid = Math.max(0, inv.amountPaid - pay.amount)
      const today = new Date().toISOString().slice(0, 10)
      const overdue = inv.dueDate < today
      const status = amountPaid === 0
        ? (overdue ? 'OVERDUE' : 'PENDING')
        : (overdue ? 'OVERDUE' : 'PARTIALLY_PAID')
      await db.feeInvoice.update({
        where: { id: inv.id },
        data: { amountPaid, status },
      })
      await db.invoiceInstalment.updateMany({
        where: { invoiceId: inv.id },
        data: { paidAmount: 0, paidAt: null },
      })
    }
    await db.ledgerEntry.deleteMany({ where: { referenceType: 'Payment', referenceId: pay.id } })
    await db.payment.delete({ where: { id: pay.id } })
    console.log(`reversed receipt ${pay.receiptNumber}`)
  }

  // 4. E2E notifications
  const n1 = await db.notification.deleteMany({ where: { OR: [
    { body: { contains: 'E2E' } },
    { title: { contains: 'Salary paid' } },
    { title: { contains: 'Payment received' } },
    { title: 'Leave request awaiting your approval', body: { contains: 'requested Sick leave' } },
    { title: 'Leave request awaiting your approval', body: { contains: 'requested Annual leave' } },
  ] } })
  console.log(`deleted ${n1.count} E2E notification(s)`)

  const seedCheck = await db.notification.findFirst({
    where: { title: 'Leave request awaiting your approval' },
  })
  console.log(seedCheck ? 'seed admin notification preserved ✓' : 'note: seed admin notification was removed')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
