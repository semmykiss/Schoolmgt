'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts'
import { ClipboardCheck, Users, Wallet, PiggyBank } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { StatCard } from '@/components/shared/stat-card'
import { ChartCard, CHART, PIE_COLORS, tooltipStyle, axisTick, titleCase } from './chart-kit'
import type { EnrollmentReport, FinancialReport } from '@/lib/api/report-data'

export function OverviewTab() {
  const enrollment = useQuery({
    queryKey: qk.reportEnrollment,
    queryFn: () => api<EnrollmentReport>('/reports/enrollment'),
  })
  const financial = useQuery({
    queryKey: qk.reportFinancial(),
    queryFn: () => api<FinancialReport>('/reports/financial'),
  })

  const e = enrollment.data
  const f = financial.data
  const trendData = (e?.admissionsTrend ?? []).map(t => ({ ...t, students: t.count }))
  const ledgerData = f?.ledgerByMonth ?? []
  const statusData = (f?.byStatus ?? []).map(s => ({ name: titleCase(s.status), value: s.total }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={e?.totals.activeStudents ?? 0}
          icon={Users}
          tone="primary"
          loading={enrollment.isLoading}
          hint={e ? `${e.totals.male} male • ${e.totals.female} female` : undefined}
        />
        <StatCard
          label="Active staff"
          value={e?.totals.staff ?? 0}
          icon={ClipboardCheck}
          loading={enrollment.isLoading}
          hint={e ? `${e.totals.classes} classes • ${e.totals.sections} sections` : undefined}
        />
        <StatCard
          label="Collection rate"
          value={f?.summary.collectionRate !== null && f?.summary.collectionRate !== undefined ? `${f.summary.collectionRate}%` : '—'}
          icon={PiggyBank}
          tone="success"
          loading={financial.isLoading}
          hint={f ? `${formatNaira(f.summary.collected)} of ${formatNaira(f.summary.expected)}` : undefined}
        />
        <StatCard
          label="Outstanding fees"
          value={formatNaira(f?.summary.outstanding ?? 0)}
          icon={Wallet}
          tone="warning"
          loading={financial.isLoading}
          hint={f ? `${formatNaira(f.summary.ledgerIncome - f.summary.ledgerExpense)} net (6 months)` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Admissions — last 12 months"
          icon={Users}
          loading={enrollment.isLoading}
          empty={(e?.admissionsTrend.length ?? 0) === 0 ? 'No enrollment data yet' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} interval={1} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Line type="monotone" dataKey="students" name="New students" stroke={CHART.teal} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Income vs expense — last 6 months (ledger)"
          icon={Wallet}
          loading={financial.isLoading}
          empty={ledgerData.every(d => d.income === 0 && d.expense === 0) ? 'No ledger entries yet' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ledgerData.slice(-6)} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} />
                <YAxis tickFormatter={v => formatNaira(Number(v), { compact: true })} tickLine={false} axisLine={false} width={64} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => formatNaira(Number(v))} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Expense" fill={CHART.amber} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Invoice value by status"
        icon={Wallet}
        loading={financial.isLoading}
        empty={(statusData.length ?? 0) === 0 ? 'No invoices yet' : null}
        contentClassName="grid grid-cols-1 gap-4 lg:grid-cols-2"
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
        <ul className="space-y-2 self-center">
          {(f?.byStatus ?? []).map(s => (
            <li key={s.status} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{titleCase(s.status)}</p>
                <p className="text-xs text-muted-foreground">{s.count} invoice(s)</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatNaira(s.total)}</p>
                <p className="text-xs text-muted-foreground">{formatNaira(s.paid)} paid</p>
              </div>
            </li>
          ))}
        </ul>
      </ChartCard>
    </div>
  )
}
