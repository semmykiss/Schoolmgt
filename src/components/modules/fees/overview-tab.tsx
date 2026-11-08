'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, Banknote, Landmark, ReceiptText, Receipt,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { INVOICE_STATUSES } from '@/lib/validation/fees'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'

interface FeesSummary {
  billed: number
  collected: number
  outstanding: number
  invoiceCount: number
  statusCounts: Record<string, number>
  defaulters: {
    invoiceId: string
    student: { firstName: string; lastName: string; admissionNumber: string; class: { name: string } | null }
    total: number; amountPaid: number; balance: number; dueDate: string
  }[]
  recentPayments: {
    id: string; receiptNumber: string; amount: number; method: string; paidAt: string
    invoice: { invoiceNumber: string; student: { firstName: string; lastName: string } }
  }[]
}

const STATUS_TONE: Record<string, string> = {
  PAID: 'bg-emerald-500',
  PARTIAL: 'bg-amber-500',
  UNPAID: 'bg-zinc-400 dark:bg-zinc-600',
  OVERDUE: 'bg-red-500',
  VOID: 'bg-zinc-300 dark:bg-zinc-700',
}

const STATUS_HEX: Record<string, string> = {
  PAID: '#10b981',
  PARTIAL: '#f59e0b',
  UNPAID: '#a1a1aa',
  OVERDUE: '#ef4444',
  VOID: '#d4d4d8',
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', TRANSFER: 'Transfer', POS: 'POS', CHEQUE: 'Cheque', ONLINE: 'Online',
}

export function FeesOverviewTab({ onOpenInvoices }: { onOpenInvoices: () => void }) {
  const [termId, setTermId] = useState<string>('')

  const { data: terms } = useQuery({
    queryKey: qk.terms(),
    queryFn: () => api<{ items: { id: string; name: string; sessionName?: string }[] }>('/academics/terms?pageSize=100'),
  })

  const { data, isLoading } = useQuery({
    queryKey: qk.feesSummary(termId),
    queryFn: () => api<FeesSummary>('/fees/summary', { query: { termId: termId || undefined } }),
  })

  const collectionRate = data && data.billed > 0 ? Math.round((data.collected / data.billed) * 100) : 0
  const pieData = data
    ? INVOICE_STATUSES
        .filter(s => s !== 'VOID')
        .map(s => ({ name: s, value: data.statusCounts[s] ?? 0 }))
        .filter(d => d.value > 0)
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="overview-term">Term</label>
        <select
          id="overview-term"
          value={termId}
          onChange={e => setTermId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All terms</option>
          {(terms?.items ?? []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Billed" icon={ReceiptText} loading={isLoading}
          value={formatNaira(data?.billed ?? 0, { compact: true })}
          hint={`${data?.invoiceCount ?? 0} invoices`}
          tone="primary"
        />
        <StatCard
          label="Collected" icon={Banknote} loading={isLoading}
          value={formatNaira(data?.collected ?? 0, { compact: true })}
          hint={`${collectionRate}% collection rate`}
          tone="success"
        />
        <StatCard
          label="Outstanding" icon={AlertTriangle} loading={isLoading}
          value={formatNaira(data?.outstanding ?? 0, { compact: true })}
          hint={`${data?.statusCounts.OVERDUE ?? 0} overdue invoices`}
          tone="warning"
        />
        <StatCard
          label="Fully Paid" icon={Landmark} loading={isLoading}
          value={data?.statusCounts.PAID ?? 0}
          hint={`${data?.statusCounts.PARTIAL ?? 0} partly paid`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status distribution */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoice status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="mx-auto h-44 w-44 rounded-full" />
            ) : pieData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No invoices yet</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                        {pieData.map(d => (
                          <Cell key={d.name} fill={STATUS_HEX[d.name] ?? '#999'} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(v: number, n: string) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {pieData.map(d => (
                    <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_TONE[d.name])} aria-hidden />
                      {d.name} · {d.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Defaulters */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Top outstanding balances</CardTitle>
            <Button variant="ghost" size="sm" onClick={onOpenInvoices}>
              All invoices <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            {isLoading ? (
              <div className="space-y-2 px-6">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
              </div>
            ) : (data?.defaulters ?? []).length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="No outstanding balances"
                description="Every invoice for this term is fully settled — great!"
                className="border-none py-8"
              />
            ) : (
              <ul className="divide-y">
                {data!.defaulters.map(d => (
                  <li key={d.invoiceId} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.student.firstName} {d.student.lastName}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{d.student.admissionNumber}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.student.class?.name ?? '—'} · due {d.dueDate}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-destructive">{formatNaira(d.balance)}</p>
                      <p className="text-xs text-muted-foreground">of {formatNaira(d.total)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent payments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent payments</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : (data?.recentPayments ?? []).length === 0 ? (
            <EmptyState icon={Receipt} title="No payments recorded yet" className="border-none py-8" />
          ) : (
            <ul className="divide-y">
              {data!.recentPayments.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.invoice.student.firstName} {p.invoice.student.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.invoice.invoiceNumber} · {METHOD_LABEL[p.method] ?? p.method} · {p.paidAt}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatNaira(p.amount)}
                    </p>
                    <p className="hidden text-xs text-muted-foreground sm:block">{p.receiptNumber}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
