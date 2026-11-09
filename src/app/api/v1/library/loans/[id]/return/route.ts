import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { loanReturnSchema } from '@/lib/validation/inventory'
import { computeFine } from '@/lib/domain/inventory'
import { isoToday } from '@/lib/api/portal'

/**
 * PATCH /library/loans/:id/return — receive a book back.
 * Fine auto-computes from days overdue (₦50/day, capped) unless the librarian
 * overrides/waives it explicitly. Availability is restored atomically.
 */
export const PATCH = createHandler({ permission: 'library.write', body: loanReturnSchema }, async ({ user, params, body, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Loan')
  const loan = await db.bookLoan.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { book: { select: { title: true } } },
  })
  if (!loan) throw notFound('Loan not found')
  if (loan.returnedAt) throw conflict('This book has already been returned')

  const today = isoToday()
  const autoFine = computeFine(loan.dueDate, today)
  const fineAmount = body.fineAmount !== undefined && body.fineAmount !== null ? body.fineAmount : autoFine

  const updated = await db.$transaction(async tx => {
    await tx.bookLoan.update({
      where: { id: loan.id },
      data: { status: 'RETURNED', returnedAt: today, fineAmount },
    })
    return tx.libraryBook.update({
      where: { id: loan.bookId },
      data: { availableCopies: { increment: 1 } },
    })
  })

  audit({
    action: 'update',
    entity: 'BookLoan',
    entityId: loan.id,
    summary: `Received "${loan.book.title}" back from ${loan.borrowerName}${fineAmount > 0 ? ` — fine ₦${(fineAmount / 100).toLocaleString('en-NG')}` : ''}`,
  })
  return {
    id: loan.id,
    status: 'RETURNED',
    returnedAt: today,
    fineAmount,
    autoFine,
    availableCopies: updated.availableCopies,
    bookTitle: loan.book.title,
    borrowerName: loan.borrowerName,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
