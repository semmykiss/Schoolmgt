'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira, nairaInWords } from '@/lib/money'
import { periodLabel } from '@/lib/domain/hr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

// ── Payload shape (mirrors GET /hr/payslips/:id + /hr/self payslips) ───────

export interface PayslipItem {
  label: string
  amount: number // kobo
  type: string // BASIC | ALLOWANCE | EARNING | DEDUCTION
}

export interface PayslipDetail {
  id: string
  period: string
  grossAmount: number
  totalDeductions: number
  netAmount: number
  status: string
  paidAt: string | null
  items: PayslipItem[]
  employeeName?: string
  employee?: {
    staffCode: string
    firstName: string
    lastName: string
    position: string
    department: string | null
    employmentType: string
  }
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
}

/**
 * The full payslip breakdown — everything that makes up the staff member's
 * gross salary: basic salary + every allowance, then every deduction, the
 * totals and net pay (in figures and words). Used by the HR payroll register,
 * the staff self-service view and window.print() via #print-area isolation.
 */
export function PayslipDocument({ detail, compact }: { detail: PayslipDetail; compact?: boolean }) {
  const school = useSession(s => s.school)
  const items = detail.items ?? []
  const earnings = items.filter(i => i.type !== 'DEDUCTION')
  const deductions = items.filter(i => i.type === 'DEDUCTION')
  const annualGross = detail.grossAmount * 12
  const annualNet = detail.netAmount * 12
  const emp = detail.employee
  const empName = detail.employeeName
    ?? (emp ? `${emp.firstName} ${emp.lastName}` : '')

  return (
    <div
      id={compact ? undefined : 'print-area'}
      className="flex flex-col gap-4 rounded-xl border bg-card text-card-foreground print:rounded-none print:border-0"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-lg font-bold tracking-tight">{school?.name ?? 'SchoolDesk'}</p>
          {school?.city && (
            <p className="text-xs text-muted-foreground print:text-black">
              {school.city}{school.state ? `, ${school.state}` : ''}
            </p>
          )}
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-muted-foreground print:text-black">
            Payslip · {periodLabel(detail.period)}
          </p>
        </div>
        <Badge variant={detail.status === 'PAID' ? 'default' : 'secondary'} className="print:border print:border-black">
          {detail.status === 'PAID' ? `Paid${detail.paidAt ? ` · ${detail.paidAt}` : ''}` : 'Draft'}
        </Badge>
      </div>

      {/* Employee grid */}
      {emp && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Staff</p>
            <p className="font-medium">{empName}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Staff No.</p>
            <p className="font-medium">{emp.staffCode}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Position</p>
            <p className="font-medium">{emp.position}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Department</p>
            <p className="font-medium">{emp.department ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Employment</p>
            <p className="font-medium">{EMPLOYMENT_LABEL[emp.employmentType] ?? emp.employmentType}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground print:text-black">Pay period</p>
            <p className="font-medium">{periodLabel(detail.period)}</p>
          </div>
        </div>
      )}

      {/* Earnings vs deductions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border">
          <p className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide print:bg-transparent print:text-black">
            Earnings — what makes up the gross
          </p>
          <div className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
            {earnings.length === 0 && (
              <p className="text-xs text-muted-foreground">No breakdown recorded.</p>
            )}
            {earnings.map(i => (
              <div key={i.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground print:text-black">{i.label}</span>
                <span className="tabular-nums">{formatNaira(i.amount)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t pt-1.5 font-semibold">
              <span>Gross salary</span>
              <span className="tabular-nums">{formatNaira(detail.grossAmount)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <p className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide print:bg-transparent print:text-black">
            Deductions
          </p>
          <div className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
            {deductions.length === 0 && (
              <p className="text-xs text-muted-foreground">No deductions this period.</p>
            )}
            {deductions.map(i => (
              <div key={i.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground print:text-black">{i.label}</span>
                <span className="tabular-nums">−{formatNaira(i.amount)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t pt-1.5 font-semibold">
              <span>Total deductions</span>
              <span className="tabular-nums">−{formatNaira(detail.totalDeductions)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net pay */}
      <div className="rounded-lg bg-primary/5 px-4 py-3 print:bg-transparent print:border print:border-black">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black">Net pay (take-home)</p>
            <p className="text-xs text-muted-foreground print:text-black">
              Annual gross {formatNaira(annualGross, { compact: true })} · annual net {formatNaira(annualNet, { compact: true })}
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(detail.netAmount)}</p>
        </div>
        <p className="mt-1.5 text-xs italic text-muted-foreground print:text-black">
          {nairaInWords(detail.netAmount)}
        </p>
      </div>

      <p className="text-center text-[10px] text-muted-foreground print:text-black">
        Computer-generated payslip · {school?.name ?? 'SchoolDesk'} · {periodLabel(detail.period)}
      </p>
    </div>
  )
}

/**
 * Dialog that loads a payslip by id (admin/HR register + staff self-service —
 * the API only allows your own slips unless you hold hr.read) and renders the
 * full PayslipDocument with a print button.
 */
export function PayslipDialog({ slip, onOpenChange }: {
  slip: { id: string; period?: string; employeeName?: string } | null
  onOpenChange: (o: boolean) => void
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: qk.payslip(slip?.id),
    queryFn: () => api<PayslipDetail>(`/hr/payslips/${slip!.id}`),
    enabled: !!slip,
  })

  return (
    <Dialog open={!!slip} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="print:hidden">
          <DialogTitle>Payslip — {slip?.employeeName ?? detail?.employeeName}</DialogTitle>
          <DialogDescription>
            Full salary breakdown for {slip ? periodLabel(slip.period ?? '') : ''}.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !detail ? (
          <div className="flex justify-center py-10 print:hidden">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="max-h-[65vh] overflow-y-auto pr-1 print:max-h-none print:overflow-visible print:pr-0">
              <PayslipDocument detail={detail} />
            </div>
            <div className="flex justify-end print:hidden">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print payslip
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
