import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'

/**
 * Income vs expense analytics:
 *   - monthly series (for the chart)
 *   - category breakdown
 *   - net position
 * Requires a from/to range (defaults to the current year).
 */
export const GET = createHandler({ permission: 'accounts.read' }, async ({ user, query }) => {
  const today = new Date()
  const from = query.get('from') || `${today.getFullYear()}-01-01`
  const to = query.get('to') || `${today.getFullYear()}-12-31`
  if (from > to) throw badRequest('"From" date must be before "To" date')

  const entries = await db.ledgerEntry.findMany({
    where: { schoolId: user.schoolId, date: { gte: from, lte: to } },
    select: { type: true, category: true, amount: true, date: true },
    orderBy: { date: 'asc' },
  })

  // Monthly series — always render all 12 months of the range's years for a stable chart.
  const startYear = Number(from.slice(0, 4))
  const endYear = Number(to.slice(0, 4))
  const months: { month: string; income: number; expense: number }[] = []
  const byMonth = new Map<string, { income: number; expense: number }>()
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      const bucket = { income: 0, expense: 0 }
      byMonth.set(key, bucket)
      months.push({ month: key, ...bucket })
    }
  }
  const categories: Record<string, { income: number; expense: number }> = {}
  let income = 0
  let expense = 0
  for (const e of entries) {
    const key = e.date.slice(0, 7)
    const bucket = byMonth.get(key)
    if (e.type === 'INCOME') {
      income += e.amount
      if (bucket) bucket.income += e.amount
      categories[e.category] ??= { income: 0, expense: 0 }
      categories[e.category].income += e.amount
    } else {
      expense += e.amount
      if (bucket) bucket.expense += e.amount
      categories[e.category] ??= { income: 0, expense: 0 }
      categories[e.category].expense += e.amount
    }
  }

  const monthSeries = months.map(m => ({
    month: m.month.slice(5), // "01".."12"
    income: byMonth.get(m.month)?.income ?? 0,
    expense: byMonth.get(m.month)?.expense ?? 0,
  }))

  const categoryBreakdown = Object.entries(categories)
    .map(([category, v]) => ({ category, ...v, net: v.income - v.expense }))
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))

  return {
    from, to,
    totals: { income, expense, net: income - expense },
    monthSeries,
    categoryBreakdown,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
