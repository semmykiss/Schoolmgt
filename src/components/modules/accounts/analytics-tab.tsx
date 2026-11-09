'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight, ArrowUpRight, Scale, TrendingUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface SummaryResp {
  from: string
  to: string
  totals: { income: number; expense: number; net: number }
  monthSeries: { month: string; income: number; expense: number }[]
  categoryBreakdown: { category: string; income: number; expense: number; net: number }[]
}

const CATEGORY_LABEL: Record<string, string> = {
  TUITION: 'Tuition', OTHER_INCOME: 'Other income', SALARIES: 'Salaries',
  UTILITIES: 'Utilities', MAINTENANCE: 'Maintenance', SUPPLIES: 'Supplies',
  TRANSPORT: 'Transport', EVENTS: 'Events', TAXES: 'Taxes', OTHER: 'Other',
}

const nairaCompact = (n: number) => formatNaira(n, { compact: true })

export function AccountsAnalyticsTab() {
  const [year, setYear] = useState(new Date().getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: qk.accountsSummary(`${year}-01-01`, `${year}-12-31`),
    queryFn: () => api<SummaryResp>('/accounts/summary', { query: { from: `${year}-01-01`, to: `${year}-12-31` } }),
  })

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const series = (data?.monthSeries ?? []).map(m => ({
    ...m,
    label: monthLabels[Number(m.month) - 1] ?? m.month,
    incomeN: m.income / 100,
    expenseN: m.expense / 100,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label htmlFor="acc-year" className="text-sm text-muted-foreground">Year</label>
        <select
          id="acc-year"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {[0, 1, 2].map(back => <option key={back} value={new Date().getFullYear() - back}>{new Date().getFullYear() - back}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        <StatCard label="Total income" icon={ArrowUpRight} tone="success" loading={isLoading}
          value={formatNaira(data?.totals.income ?? 0, { compact: true })} hint={`Jan – Dec ${year}`} />
        <StatCard label="Total expense" icon={ArrowDownRight} tone="destructive" loading={isLoading}
          value={formatNaira(data?.totals.expense ?? 0, { compact: true })} hint={`Jan – Dec ${year}`} />
        <StatCard label="Net position" icon={Scale} loading={isLoading}
          tone={(data?.totals.net ?? 0) >= 0 ? 'primary' : 'destructive'}
          value={formatNaira(data?.totals.net ?? 0, { compact: true })}
          hint={(data?.totals.net ?? 0) >= 0 ? 'Surplus' : 'Deficit'} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" aria-hidden /> Income vs expense — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickLine={false} axisLine={false} fontSize={11} width={56}
                    tickFormatter={(v: number) => nairaCompact(v * 100)}
                  />
                  <ChartTooltip
                    formatter={(value: number, name: string) => [
                      formatNaira(name === 'Income' ? value * 100 : value * 100),
                      name,
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="incomeN" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenseN" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Category breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data || data.categoryBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions in {year}</p>
          ) : (
            <ul className="divide-y">
              {data.categoryBreakdown.map(c => (
                <li key={c.category} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{CATEGORY_LABEL[c.category] ?? c.category}</p>
                    {c.income > 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400">in {nairaCompact(c.income)}</p>}
                    {c.expense > 0 && <p className="text-xs text-destructive">out {nairaCompact(c.expense)}</p>}
                  </div>
                  <p className={`text-sm font-semibold tabular-nums ${c.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {c.net >= 0 ? '+' : '−'}{nairaCompact(Math.abs(c.net))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
