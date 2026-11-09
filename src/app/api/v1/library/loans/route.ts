import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { loanIssueSchema } from '@/lib/validation/inventory'
import { effectiveLoanStatus, overdueDays } from '@/lib/domain/inventory'
import { isoToday } from '@/lib/api/portal'

/**
 * GET /library/loans — issuing register (?status=, ?bookId=, ?search=).
 * ISSUED rows past their due date are lazily flipped to OVERDUE so the
 * register and fines stay accurate without a cron job.
 */
export const GET = createHandler({ permission: 'library.read' }, async ({ user, query }) => {
  const today = isoToday()
  await db.bookLoan.updateMany({
    where: { schoolId: user.schoolId, status: 'ISSUED', dueDate: { lt: today } },
    data: { status: 'OVERDUE' },
  })

  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const status = query.get('status')
  if (status) where.status = status
  const bookId = query.get('bookId')
  if (bookId) where.bookId = bookId
  if (q.search) where.borrowerName = { contains: q.search }

  const [rows, total] = await Promise.all([
    db.bookLoan.findMany({
      where,
      orderBy: [{ borrowedAt: 'desc' }],
      include: { book: { select: { title: true, shelf: true } } },
      skip: q.skip,
      take: q.take,
    }),
    db.bookLoan.count({ where }),
  ])

  const items = rows.map(l => ({
    ...l,
    bookTitle: l.book.title,
    daysOverdue: l.returnedAt ? 0 : overdueDays(l.dueDate, today),
  }))
  return paginated(items, total, q)
})

/**
 * POST /library/loans — issue a book to a student or staff member.
 * Requires an available copy; decrements availability atomically.
 */
export const POST = createHandler({ permission: 'library.write', body: loanIssueSchema }, async ({ user, body, audit }) => {
  const book = await db.libraryBook.findFirst({ where: { id: body.bookId, schoolId: user.schoolId } })
  if (!book) throw notFound('Book not found')
  if (book.availableCopies <= 0) throw conflict(`No copies of "${book.title}" are available right now`)

  let borrowerName = ''
  if (body.borrowerType === 'STUDENT') {
    const student = await db.student.findFirst({
      where: { id: body.borrowerId, schoolId: user.schoolId, status: 'ACTIVE' },
      select: { firstName: true, lastName: true, otherName: true, admissionNumber: true },
    })
    if (!student) throw badRequest('Selected student was not found in your school')
    borrowerName = [student.firstName, student.lastName, student.otherName].filter(Boolean).join(' ')
  } else {
    const employee = await db.employee.findFirst({
      where: { id: body.borrowerId, schoolId: user.schoolId, status: 'ACTIVE' },
      select: { firstName: true, lastName: true, staffCode: true },
    })
    if (!employee) throw badRequest('Selected staff member was not found in your school')
    borrowerName = `${employee.firstName} ${employee.lastName}`
  }

  if (body.dueDate < isoToday()) throw badRequest('Due date cannot be in the past')

  const created = await db.$transaction(async tx => {
    const updatedBook = await tx.libraryBook.update({
      where: { id: book.id },
      data: { availableCopies: { decrement: 1 } },
    })
    if (updatedBook.availableCopies < 0) throw conflict(`No copies of "${book.title}" are available right now`)
    return tx.bookLoan.create({
      data: {
        schoolId: user.schoolId,
        bookId: book.id,
        borrowerType: body.borrowerType,
        borrowerId: body.borrowerId,
        borrowerName,
        borrowedAt: isoToday(),
        dueDate: body.dueDate,
        status: 'ISSUED',
      },
      include: { book: { select: { title: true, shelf: true } } },
    })
  })

  audit({
    action: 'create',
    entity: 'BookLoan',
    entityId: created.id,
    summary: `Issued "${book.title}" to ${borrowerName} (due ${body.dueDate})`,
  })
  return { ...created, bookTitle: created.book.title, daysOverdue: 0, effectiveStatus: effectiveLoanStatus(created, isoToday()) }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
