import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { ledgerEntryCreateSchema } from '@/lib/validation/fees'

export const GET = createHandler({ permission: 'accounts.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 30 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const type = query.get('type')
  const category = query.get('category')
  const from = query.get('from')
  const to = query.get('to')
  if (type) where.type = type
  if (category) where.category = category
  if (from && to) where.date = { gte: from, lte: to }
  else if (from) where.date = { gte: from }
  else if (to) where.date = { lte: to }
  if (q.search) where.description = { contains: q.search }

  const [items, total] = await Promise.all([
    db.ledgerEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: q.skip, take: q.take,
    }),
    db.ledgerEntry.count({ where }),
  ])

  const aggregates = await db.ledgerEntry.groupBy({
    by: ['type'],
    where: { schoolId: user.schoolId, ...(from && to ? { date: { gte: from, lte: to } } : {}) },
    _sum: { amount: true },
  })
  const income = aggregates.find(a => a.type === 'INCOME')?._sum.amount ?? 0
  const expense = aggregates.find(a => a.type === 'EXPENSE')?._sum.amount ?? 0

  return { ...paginated(items, total, q), totals: { income, expense, net: income - expense } }
})

export const POST = createHandler({ permission: 'accounts.write', body: ledgerEntryCreateSchema }, async ({ user, body, audit }) => {
  const created = await db.ledgerEntry.create({ data: {
    schoolId: user.schoolId,
    type: body.type,
    category: body.category,
    description: body.description.trim(),
    amount: body.amount,
    date: body.date,
    source: 'MANUAL',
    recordedById: user.id,
  } })
  audit({
    action: 'CREATE', entity: 'LedgerEntry', entityId: created.id,
    summary: `Logged ${body.type.toLowerCase()} of ₦${(body.amount / 100).toLocaleString('en-NG')} — ${created.description}`,
  })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
