'use client'

import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Award, CalendarCheck, FileText, Loader2, ReceiptText, Wallet,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ChildDetailPayload {
  summary: {
    fullName: string
    admissionNumber: string
    className: string | null
    sectionName: string | null
    attendance: { pct: number; present: number; late: number; absent: number; total: number }
    fees: { dueKobo: number; unpaidCount: number; overdueCount: number }
  }
  invoices: {
    id: string
    invoiceNumber: string
    termId: string
    total: number
    amountPaid: number
    balance: number
    status: string
    dueDate: string
    isOverdue: boolean
  }[]
  payments: { id: string; amount: number; method: string; paidAt: string; reference: string | null; invoice: { invoiceNumber: string } }[]
  recentAttendance: { id: string; date: string; status: string; remarks: string | null }[]
  reportCards: { id: string; average: number; position: number; grade: string | null; teacherRemark: string | null; principalRemark: string | null; generatedAt: string; exam: { name: string } }[]
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'PAID': return 'default'
    case 'PARTIAL': return 'secondary'
    case 'OVERDUE': return 'destructive'
    default: return 'outline'
  }
}

export function ChildDetailsDialog({ studentId, studentName, open, onOpenChange, trigger }: {
  studentId: string
  studentName: string
  open: boolean
  onOpenChange: (o: boolean) => void
  trigger?: React.ReactNode
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.child(studentId),
    queryFn: () => api<ChildDetailPayload>(`/portal/child/${studentId}`),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{studentName} — full records</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.summary.admissionNumber} · ${data.summary.className ?? '—'}${data.summary.sectionName ? ` ${data.summary.sectionName}` : ''}`
              : 'Loading records…'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        )}
        {isError && (
          <p className="py-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load records'}
          </p>
        )}

        {data && (
          <div className="space-y-5">
            {/* Report cards */}
            <section aria-label="Report cards" className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Award className="h-4 w-4 text-primary" aria-hidden /> Published results
              </h3>
              {data.reportCards.length === 0 ? (
                <EmptyState compact icon={Award} title="No published results yet" description="Results appear here once the school publishes report cards." />
              ) : (
                <ul className="space-y-2">
                  {data.reportCards.map(rc => (
                    <li key={rc.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{rc.exam.name}</span>
                        <Badge variant="secondary" className="tabular-nums">Avg {Math.round(rc.average)}%</Badge>
                        {rc.grade && <Badge variant="outline">{rc.grade}</Badge>}
                        <Badge variant="outline" className="tabular-nums">Position {rc.position}</Badge>
                      </div>
                      {rc.teacherRemark && <p className="mt-1.5 text-xs text-muted-foreground">Teacher: {rc.teacherRemark}</p>}
                      {rc.principalRemark && <p className="mt-0.5 text-xs text-muted-foreground">Principal: {rc.principalRemark}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Fees */}
            <section aria-label="Fees" className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Wallet className="h-4 w-4 text-primary" aria-hidden /> Fee invoices
              </h3>
              {data.invoices.length === 0 ? (
                <EmptyState compact icon={Wallet} title="No invoices" />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.invoices.map(inv => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                      <span className="text-xs text-muted-foreground">due {inv.dueDate}</span>
                      <Badge variant={statusBadgeVariant(inv.status)} className="ml-auto text-[10px]">{inv.status}</Badge>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums">{formatNaira(inv.total)}</span>
                      <span className={cn('w-28 shrink-0 text-right text-xs font-medium tabular-nums', inv.balance > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                        {inv.balance > 0 ? `${formatNaira(inv.balance)} due` : 'Settled'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {data.payments.length > 0 && (
                <ul className="space-y-1 px-1">
                  {data.payments.map(p => (
                    <li key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ReceiptText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="font-medium text-foreground tabular-nums">{formatNaira(p.amount)}</span>
                      <span>via {p.method.toLowerCase()}</span>
                      <span>· {p.paidAt}</span>
                      <span className="truncate">· {p.invoice.invoiceNumber}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent attendance */}
            <section aria-label="Recent attendance" className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarCheck className="h-4 w-4 text-primary" aria-hidden /> Recent attendance
              </h3>
              {data.recentAttendance.length === 0 ? (
                <EmptyState compact icon={CalendarCheck} title="No attendance marks yet" />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.recentAttendance.map(a => (
                    <span
                      key={a.id}
                      title={`${a.date} — ${a.status}${a.remarks ? ` (${a.remarks})` : ''}`}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[11px] font-medium',
                        a.status === 'PRESENT' && 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
                        a.status === 'LATE' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                        a.status === 'ABSENT' && 'border-destructive/30 bg-destructive/10 text-destructive',
                        a.status === 'EXCUSED' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {a.date.slice(5)}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <Card className="py-0">
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-xs text-muted-foreground">
                <span>Attendance this term: <span className="font-medium text-foreground">{data.summary.attendance.pct}%</span></span>
                <span>Fees outstanding: <span className={cn('font-medium', data.summary.fees.dueKobo > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>{formatNaira(data.summary.fees.dueKobo)}</span></span>
                <span>Records refreshed {formatDistanceToNow(new Date(), { addSuffix: true })}</span>
              </CardContent>
            </Card>

            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
