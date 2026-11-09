import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { bookUpdateSchema } from '@/lib/validation/inventory'

/** PATCH /library/books/:id — edit catalogue entry. Growing totalCopies tops up availability. */
export const PATCH = createHandler({ permission: 'library.write', body: bookUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Book')
  const book = await db.libraryBook.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!book) throw notFound('Book not found')

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.author !== undefined) data.author = body.author || null
  if (body.isbn !== undefined) data.isbn = body.isbn || null
  if (body.category !== undefined) data.category = body.category || null
  if (body.shelf !== undefined) data.shelf = body.shelf || null

  // Copies changed → reconcile availability by the delta, never below zero.
  let extra: string | null = null
  if (body.totalCopies !== undefined && body.totalCopies !== book.totalCopies) {
    const delta = body.totalCopies - book.totalCopies
    const nextAvailable = Math.max(0, book.availableCopies + delta)
    data.totalCopies = body.totalCopies
    data.availableCopies = nextAvailable
    extra = delta > 0 ? `+${delta} copies` : `${delta} copies (active loans kept)`
  }

  const updated = await db.libraryBook.update({ where: { id }, data })
  audit({ action: 'update', entity: 'LibraryBook', entityId: id, summary: `Updated "${updated.title}"${extra ? ` — ${extra}` : ''}` })
  return updated
})

/** DELETE /library/books/:id — blocked while copies are still out with borrowers. */
export const DELETE = createHandler({ permission: 'library.write' }, async ({ user, params, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Book')
  const book = await db.libraryBook.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!book) throw notFound('Book not found')

  const outCount = book.totalCopies - book.availableCopies
  if (outCount > 0) {
    throw conflict(`"${book.title}" still has ${outCount} copy/copies out with borrowers — receive them back first`)
  }

  await db.libraryBook.delete({ where: { id } })
  audit({ action: 'delete', entity: 'LibraryBook', entityId: id, summary: `Removed "${book.title}" from the catalogue` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
