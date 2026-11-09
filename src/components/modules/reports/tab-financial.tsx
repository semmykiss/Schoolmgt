'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Download, PiggyBank, Wallet, Landmark } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { downloadCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatCard } from '@/components/shared/stat-card'
import { ChartCard, CHART, PIE_COLORS, tooltipStyle, axisTick, STATUS_TONE, titleCase } from './chart-kit'
import type { FinancialReport, ReportFilters } from './types'

interface Props {
  filters: ReportFilters
  onFilterChange: (patch: Partial<ReportFilters>) => void
  canWrite: boolean
}

export function FinancialTab({ filters, onFilterChange, canWrite }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: qk.reportFinancial(filters.termId),
    queryFn: () => api<FinancialReport>(`/reports/financial${filters.termId ? `?termId=${filters.termId}` : ''}`),
  })

  const statusData = (data?.byStatus ?? []).map(s => ({ name: titleCase(s.status), value: s.total }))
  const expenseData = (data?.expenseByCategory ?? []).map(c => ({ name: titleCase(c.category.toLowerCase()), amount: c.amount }))
  const paymentData = data?.paymentsByMonth ?? []

  const exportCsv = () => {
    if (!data) return
    downloadCsv('financial-report', data.byClass.map(r => ({
      className: r.className,
      students: r.students,
      expected: r.expected / 100,
      collected: r.collected / 100,
      outstanding: r.outstanding / 100,
    })), [
      { key: 'className', label: 'Class' },
      { key: 'students', label: 'Students' },
      { key: 'expected', label: 'Expected (NGN)' },
      { key: 'collected', label: 'Collected (NGN)' },
      { key: 'outstanding', label: 'Outstanding (NGN)' },
    ])
  }

  return (
    <div className="space-y-4">
      <ChartCard
        title="Fee collection summary"
        icon={Wallet}
        loading={isLoading}
        empty={null}
        action={
          <div className="flex items-center gap-2">
            <Select value={filters.termId || 'all'} onValueChange={v => onFilterChange({ termId: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Select term">
                <SelectValue placeholder="All terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {(data?.terms ?? []).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {titleCase(t.name)} • {t.session}{t.isCurrent ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!data || data.byClass.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                CSV
              </Button>
            )}
          </div>
        }
        contentClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Expected" value={formatNaira(data?.summary.expected ?? 0)} icon={Wallet} loading={isLoading} />
          <StatCard
            label="Collected"
            value={formatNaira(data?.summary.collected ?? 0)}
            icon={PiggyBank}
            tone="success"
            loading={isLoading}
            hint={data?.summary.collectionRate !== null && data?.summary.collectionRate !== undefined ? `${data.summary.collectionRate}% rate` : undefined}
          />
          <StatCard label="Outstanding" value={formatNaira(data?.summary.outstanding ?? 0)} icon={AlertTriangle} tone="warning" loading={isLoading} />
          <StatCard
            label="Ledger net (6 months)"
            value={formatNaira(data?.summary.net ?? 0)}
            icon={Landmark}
            tone={(data?.summary.net ?? 0) >= 0 ? 'success' : 'destructive'}
            loading={isLoading}
            hint={data ? `${formatNaira(data.summary.ledgerIncome)} in • ${formatNaira(data.summary.ledgerExpense)} out` : undefined}
          />
        </div>
      </ChartCard>

      <ChartCard
        title="Expected vs collected by class"
        icon={Wallet}
        loading={isLoading}
        empty={(data?.byClass.length ?? 0) === 0 ? 'No invoices raised yet' : null}
      >
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-40">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.byClass ?? []).map(c => {
                const rate = c.expected > 0 ? Math.round((c.collected / c.expected) * 100) : 0
                return (
                  <TableRow key={c.className}>
                    <TableCell className="font-medium">{c.className}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNaira(c.expected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNaira(c.collected)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', c.outstanding > 0 && 'text-amber-600 dark:text-amber-400')}>
                      {formatNaira(c.outstanding)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={rate} className="h-2" aria-label={`${rate}% collected`} />
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{rate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Payments received — monthly"
          icon={PiggyBank}
          loading={isLoading}
          empty={paymentData.every(p => p.amount === 0) ? 'No payments in this period' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} />
                <YAxis tickFormatter={v => formatNaira(Number(v), { compact: true })} tickLine={false} axisLine={false} width={64} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => formatNaira(Number(v))} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="amount" name="Collected" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Invoice value by status"
          icon={Wallet}
          loading={isLoading}
          empty={(statusData.length ?? 0) === 0 ? 'No invoices yet' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={2}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatNaira(Number(v))} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Expense by category (ledger)"
          icon={Landmark}
          loading={isLoading}
          empty={(expenseData.length ?? 0) === 0 ? 'No expenses recorded' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tickFormatter={v => formatNaira(Number(v), { compact: true })} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} />
                <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ ...axisTick, fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => formatNaira(Number(v))} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="amount" name="Expense" fill={CHART.amber} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top outstanding balances"
          icon={AlertTriangle}
          loading={isLoading}
          empty={(data?.defaulters.length ?? 0) === 0 ? 'No outstanding balances 🎉' : null}
        >
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.defaulters ?? []).map(d => (
                  <TableRow key={d.invoiceNumber}>
                    <TableCell>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.className}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.invoiceNumber}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(`${d.dueDate}T00:00:00`), 'd MMM yy')}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">{formatNaira(d.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(data?.methodMix.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(data?.methodMix ?? []).map(m => (
                <Badge key={m.method} variant="secondary" className="bg-muted text-muted-foreground">
                  {titleCase(m.method.toLowerCase())}: {m.count} ({formatNaira(m.amount)})
                </Badge>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
