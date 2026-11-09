// Phase 9 demo data — inventory & library showcase (idempotent):
//   • stock items across categories with a couple below re-order level
//   • suppliers + stock movements (IN purchases, OUT issues, one ADJUST)
//   • library catalogue (textbooks, literature, reference)
//   • loans: one active, one overdue (past due date), one returned with fine
// Run: bunx tsx scripts/phase9-seed.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

async function main() {
  const school = await db.school.findFirst()
  if (!school) throw new Error('No school found — run the main seed first')
  const schoolId = school.id
  const admin = await db.user.findFirst({ where: { schoolId, role: 'ADMIN' } })

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const supplierNames = [
    { name: 'Lagos Books & Supplies Ltd', contactName: 'Mr. Chuka Eze', phone: '0803 441 2299', email: 'sales@lagosbooks.ng', address: '12 Akin Adesola St, Victoria Island, Lagos', notes: 'Net 30 payment terms. Delivers Tuesdays & Fridays.' },
    { name: 'Crestfield Stationers', contactName: 'Mrs. Bisi Adeoye', phone: '0805 220 7781', email: 'orders@crestfield.ng', address: '5 Obafemi Awolowo Way, Ikeja, Lagos', notes: 'Bulk discounts above 50 units.' },
    { name: 'CleanPro Nigeria', contactName: 'Mr. Yusuf Bello', phone: '0810 553 9902', email: 'hello@cleanpro.ng', address: '23 Oregun Road, Ikeja, Lagos', notes: null },
  ]
  const suppliers: Record<string, string> = {}
  for (const s of supplierNames) {
    const row = await db.supplier.upsert({
      where: { schoolId_name: { schoolId, name: s.name } },
      create: { schoolId, ...s },
      update: {},
    })
    suppliers[s.name] = row.id
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  const itemSpecs = [
    { name: 'Chalk (box of 100)', sku: 'STN-001', category: 'Stationery', unit: 'cartons', stockQty: 24, reorderLevel: 10, unitPrice: 85000 },
    { name: 'Whiteboard markers', sku: 'STN-002', category: 'Stationery', unit: 'pcs', stockQty: 8, reorderLevel: 15, unitPrice: 45000 },
    { name: 'Exercise books (40 leaves)', sku: 'STN-003', category: 'Stationery', unit: 'packs', stockQty: 120, reorderLevel: 40, unitPrice: 65000 },
    { name: 'School crest badges', sku: 'UNI-001', category: 'Uniform', unit: 'pcs', stockQty: 65, reorderLevel: 20, unitPrice: 150000 },
    { name: 'JSS 1 tie', sku: 'UNI-002', category: 'Uniform', unit: 'pcs', stockQty: 18, reorderLevel: 25, unitPrice: 275000 },
    { name: 'Detergent (5 kg)', sku: 'CLN-001', category: 'Cleaning', unit: 'pcs', stockQty: 6, reorderLevel: 8, unitPrice: 920000 },
    { name: 'Football (size 5)', sku: 'SPT-001', category: 'Sports', unit: 'pcs', stockQty: 9, reorderLevel: 4, unitPrice: 1250000 },
    { name: 'A4 photocopier paper', sku: 'ICT-001', category: 'ICT', unit: 'reams', stockQty: 32, reorderLevel: 12, unitPrice: 720000 },
  ]
  const items: Record<string, { id: string; stockQty: number; reorderLevel: number; name: string; unit: string }> = {}
  for (const it of itemSpecs) {
    const existing = await db.item.findFirst({ where: { schoolId, name: it.name } })
    const row = existing
      ? await db.item.update({ where: { id: existing.id }, data: it })
      : await db.item.create({ data: { schoolId, ...it } })
    items[it.name] = { id: row.id, stockQty: row.stockQty, reorderLevel: row.reorderLevel, name: it.name, unit: it.unit }
  }

  // ── Stock movements (only if none recorded yet) ───────────────────────────
  const movementCount = await db.stockMovement.count({ where: { schoolId } })
  if (movementCount === 0) {
    const chalk = items['Chalk (box of 100)']
    const markers = items['Whiteboard markers']
    const paper = items['A4 photocopier paper']
    const detergent = items['Detergent (5 kg)']
    await db.stockMovement.createMany({
      data: [
        { schoolId, itemId: chalk.id, type: 'IN', quantity: 30, unitCost: 85000, reason: 'Purchase', reference: 'INV-4471', supplierId: suppliers['Crestfield Stationers'], date: daysFromNow(-21), recordedById: admin?.id },
        { schoolId, itemId: paper.id, type: 'IN', quantity: 40, unitCost: 720000, reason: 'Purchase', reference: 'PO-2025-018', supplierId: suppliers['Lagos Books & Supplies Ltd'], date: daysFromNow(-14), recordedById: admin?.id },
        { schoolId, itemId: markers.id, type: 'IN', quantity: 25, unitCost: 45000, reason: 'Purchase', reference: 'INV-4488', supplierId: suppliers['Crestfield Stationers'], date: daysFromNow(-13), recordedById: admin?.id },
        { schoolId, itemId: chalk.id, type: 'OUT', quantity: 6, reason: 'Issued to class', reference: 'JSS 1 A — form room', date: daysFromNow(-9), recordedById: admin?.id },
        { schoolId, itemId: paper.id, type: 'OUT', quantity: 8, reason: 'Issued to staff', reference: 'Exams office', date: daysFromNow(-7), recordedById: admin?.id },
        { schoolId, itemId: detergent.id, type: 'ADJUST', quantity: 6, reason: 'Stock count', reference: 'Termly stock-take', date: daysFromNow(-4), recordedById: admin?.id },
      ],
    })
    console.log('   stock movements seeded')
  }

  // ── Library books ─────────────────────────────────────────────────────────
  const bookSpecs = [
    { title: 'New General Mathematics JSS 1', author: 'M.F. Macrae', isbn: '9780582606', category: 'Textbook', shelf: 'A-01', totalCopies: 12 },
    { title: 'New General Mathematics JSS 2', author: 'M.F. Macrae', isbn: '9780582607', category: 'Textbook', shelf: 'A-02', totalCopies: 10 },
    { title: 'Effective English Grammar', author: 'A. Ogunyemi', isbn: '9789780213', category: 'Companion', shelf: 'B-04', totalCopies: 8 },
    { title: 'Things Fall Apart', author: 'Chinua Achebe', isbn: '9780385474', category: 'Literature', shelf: 'C-11', totalCopies: 6 },
    { title: 'The Concise Oxford Dictionary', author: 'Oxford Press', isbn: '9780198610', category: 'Dictionary', shelf: 'REF-01', totalCopies: 3 },
    { title: 'Basic Science & Technology JSS 3', author: 'STAN', isbn: '9789785124', category: 'Textbook', shelf: 'A-07', totalCopies: 9 },
    { title: 'WAEC Past Questions — Sciences', author: 'WAEC', isbn: null, category: 'Past Papers', shelf: 'D-02', totalCopies: 5 },
  ]
  const books: Record<string, string> = {}
  for (const b of bookSpecs) {
    const existing = await db.libraryBook.findFirst({ where: { schoolId, title: b.title } })
    const row = existing
      ? await db.libraryBook.update({ where: { id: existing.id }, data: { ...b, availableCopies: existing.availableCopies } })
      : await db.libraryBook.create({ data: { schoolId, ...b, availableCopies: b.totalCopies } })
    books[b.title] = row.id
  }

  // ── Loans (only if none recorded yet) ─────────────────────────────────────
  const loanCount = await db.bookLoan.count({ where: { schoolId } })
  if (loanCount === 0) {
    const student = await db.student.findFirst({ where: { schoolId, status: 'ACTIVE' }, orderBy: { firstName: 'asc' } })
    const student2 = await db.student.findFirst({ where: { schoolId, status: 'ACTIVE' }, orderBy: { firstName: 'desc' } })
    const teacher = await db.employee.findFirst({ where: { schoolId, status: 'ACTIVE', position: 'Teacher' } })
    if (student && student2 && teacher) {
      await db.bookLoan.create({ data: {
        schoolId, bookId: books['Things Fall Apart'], borrowerType: 'STUDENT', borrowerId: student.id,
        borrowerName: `${student.firstName} ${student.lastName}`, borrowedAt: daysFromNow(-5), dueDate: daysFromNow(9), status: 'ISSUED',
      } })
      await db.bookLoan.create({ data: {
        schoolId, bookId: books['New General Mathematics JSS 1'], borrowerType: 'STUDENT', borrowerId: student2.id,
        borrowerName: `${student2.firstName} ${student2.lastName}`, borrowedAt: daysFromNow(-20), dueDate: daysFromNow(-6), status: 'OVERDUE',
      } })
      await db.bookLoan.create({ data: {
        schoolId, bookId: books['Effective English Grammar'], borrowerType: 'EMPLOYEE', borrowerId: teacher.id,
        borrowerName: `${teacher.firstName} ${teacher.lastName}`, borrowedAt: daysFromNow(-30), dueDate: daysFromNow(-16), returnedAt: daysFromNow(-14), status: 'RETURNED', fineAmount: 100000,
      } })
      // reflect issued copies in availability
      await db.libraryBook.update({ where: { id: books['Things Fall Apart'] }, data: { availableCopies: { decrement: 1 } } })
      await db.libraryBook.update({ where: { id: books['New General Mathematics JSS 1'] }, data: { availableCopies: { decrement: 1 } } })
      console.log('   library loans seeded (1 active, 1 overdue, 1 returned)')
    } else {
      console.log('   no students/staff found for loans — skipped')
    }
  }

  console.log('✅ Phase 9 seed complete — inventory & library demo data ready.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
