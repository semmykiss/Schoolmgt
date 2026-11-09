import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { bookCreateSchema } from '@/lib/validation/inventory'

/**
 * GET /library/books — catalogue with search (?search=), category, and
 * available=1 filter. Includes live availability from active loans.
 */
export const GET = createHandler({ permission: 'library.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) {
    where.OR = [
      { title: { contains: q.search } },
      { author: { contains: q.search } },
      { isbn: { contains: q.search } },
    ]
  }
  const category = query.get('category')
  if (category) where.category = category
  if (query.get('available') === '1') where.availableCopies = { gt: 0 }

  const [rows, total, all] = await Promise.all([
    db.libraryBook.findMany({
      where,
      orderBy: [{ title: 'asc' }],
      skip: q.skip,
      take: q.take,
    }),
    db.libraryBook.count({ where }),
    db.libraryBook.findMany({ where, select: { totalCopies: true, availableCopies: true } }),
  ])

  const stats = {
    titles: total,
    copies: all.reduce((t, b) => t + b.totalCopies, 0),
    available: all.reduce((t, b) => t + b.availableCopies, 0),
  }
  return { ...paginated(rows, total, q), stats }
})

/** POST /library/books — catalogue a new book. */
export const POST = createHandler({ permission: 'library.write', body: bookCreateSchema }, async ({ user, body, audit }) => {
  const created = await db.libraryBook.create({
    data: {
      schoolId: user.schoolId,
      title: body.title,
      author: body.author || null,
      isbn: body.isbn || null,
      category: body.category || null,
      shelf: body.shelf || null,
      totalCopies: body.totalCopies ?? 1,
      availableCopies: body.totalCopies ?? 1,
    },
  })
  audit({ action: 'create', entity: 'LibraryBook', entityId: created.id, summary: `Catalogued "${created.title}" (${created.totalCopies} copies)` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
