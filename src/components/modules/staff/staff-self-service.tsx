'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BadgeCheck, CalendarClock, CalendarOff, Eye, Loader2, Send, UserRound, Wallet,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { formatNaira } from '@/lib/money'
import {
  LEAVE_TYPE_LABEL, LEAVE_TYPES, leaveDays, periodLabel,
} from '@/lib/domain/hr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { FieldError } from '@/components/shared/field-error'
import { StatCard } from '@/components/shared/stat-card'
import { PageHeader } from '@/components/shared/page-header'
import { PayslipDialog, type PayslipDetail } from '@/components/modules/staff/payslip-document'

// ── Payload shapes (mirrors GET /hr/self) ───────────────────────────────────

interface LeaveRow {
  id: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  note: string | null
  createdAt: string
}

interface StructureInfo {
  name: string
  basicAmount: number
  allowances: { label: string; amount: number }[]
  deductions: { label: string; amount: number }[]
  effectiveFrom: string
}

interface SelfPayload {
  employee: {
    id: string
    staffCode: string
    fullName: string
    position: string
    department: string | null
    employmentType: string
    employmentDate: string
    email: string | null
    phone: string | null
    photoUrl: string | null
  }
  structure: StructureInfo | null
  leaveRequests: LeaveRow[]
  payslips: PayslipDetail[]
  stats: {
    pendingLeave: number
    approvedLeaveDaysThisYear: number
    payslipsThisYear: number
  }
}

const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  DRAFT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  REJECTED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn('border-transparent', STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground')}>{status}</Badge>
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p.charAt(0).toUpperCase()).join('') || '?'
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
}

// ── Page ────────────────────────────────────────────────────────────────────

export function StaffSelfServiceView() {
  const [fileOpen, setFileOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: qk.hrSelf,
    queryFn: () => api<SelfPayload>('/hr/self'),
    retry: false,
  })

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <EmptyState
          icon={UserRound}
          title="No staff profile linked"
          description={(error as Error).message || 'Your login is not linked to a staff record yet — contact the school office.'}
        />
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" aria-busy>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const { employee, structure, stats } = data

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Self-Service"
        description="Apply for leave and review your payslips — no need to visit the office."
      />

      {/* Profile card */}
      <section
        aria-label="Your staff profile"
        className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {employee.photoUrl
            ? <img src={employee.photoUrl} alt="" className="h-full w-full object-cover" />
            : initials(employee.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{employee.fullName}</h2>
            <Badge variant="secondary">{employee.staffCode}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {employee.position}{employee.department ? ` · ${employee.department}` : ''} · {EMPLOYMENT_LABEL[employee.employmentType] ?? employee.employmentType}
          </p>
          <p className="text-xs text-muted-foreground">
            Joined {prettyDate(employee.employmentDate)}
            {employee.email ? ` · ${employee.email}` : ''}
          </p>
        </div>
        {stats.pendingLeave > 0 && (
          <Badge className="gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {stats.pendingLeave} request{stats.pendingLeave === 1 ? '' : 's'} pending
          </Badge>
        )}
      </section>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={stats.pendingLeave} icon={CalendarClock} loading={isLoading} />
        <StatCard label="Leave days taken (YTD)" value={stats.approvedLeaveDaysThisYear} icon={CalendarOff} loading={isLoading} />
        <StatCard label="Payslips this year" value={stats.payslipsThisYear} icon={Wallet} loading={isLoading} />
      </div>

      <Tabs defaultValue="leave" className="gap-4">
        <TabsList>
          <TabsTrigger value="leave" className="gap-1.5"><CalendarOff className="h-4 w-4" /> My leave</TabsTrigger>
          <TabsTrigger value="payslips" className="gap-1.5"><Wallet className="h-4 w-4" /> My payslips</TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-2">
          <MyLeaveTab rows={data.leaveRequests} onRequest={() => setFileOpen(true)} />
        </TabsContent>
        <TabsContent value="payslips" className="mt-2">
          <MyPayslipsTab payslips={data.payslips} structure={structure} name={employee.fullName} />
        </TabsContent>
      </Tabs>

      <SelfLeaveDialog open={fileOpen} onOpenChange={setFileOpen} />
    </motion.div>
  )
}

// ── Leave tab ───────────────────────────────────────────────────────────────

function MyLeaveTab({ rows, onRequest }: { rows: LeaveRow[]; onRequest: () => void }) {
  const columns = useMemo<ColumnDef<LeaveRow, unknown>[]>(() => [
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => LEAVE_TYPE_LABEL[row.original.type] ?? row.original.type },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => (
        <div className="text-sm">
          <p>{prettyDate(row.original.startDate)} → {prettyDate(row.original.endDate)}</p>
          <p className="text-xs text-muted-foreground">{leaveDays(row.original.startDate, row.original.endDate)} day(s)</p>
        </div>
      ),
    },
    { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => <span className="line-clamp-2 max-w-56 text-sm text-muted-foreground">{row.original.reason ?? '—'}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: 'note', header: 'Decision note', cell: ({ row }) => <span className="line-clamp-2 max-w-48 text-sm text-muted-foreground">{row.original.note ?? '—'}</span> },
  ], [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your requests and their decisions. Approved leave is visible to the office.
        </p>
        <Button onClick={onRequest}><Send className="h-4 w-4" /> Request leave</Button>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        rowId={r => r.id}
        searchPlaceholder="Search your requests…"
        searchExtractor={r => `${LEAVE_TYPE_LABEL[r.type] ?? r.type} ${r.reason ?? ''}`}
        initialPageSize={10}
        emptyState={
          <EmptyState
            icon={CalendarOff}
            title="No leave requests yet"
            description="When you need time off, file a request here — it goes straight to your approvers."
            action={<Button variant="outline" onClick={onRequest}><Send className="h-4 w-4" /> Request leave</Button>}
          />
        }
      />
    </div>
  )
}

function SelfLeaveDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType] = useState('ANNUAL')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    // No employeeId → the API files this against the caller's own staff record.
    mutationFn: () => api('/hr/leave-requests', {
      method: 'POST',
      body: { type, startDate, endDate, reason: reason || undefined },
    }),
    onSuccess: () => {
      toast.success('Leave request submitted — your approvers have been notified')
      onOpenChange(false)
      setReason('')
      void qc.invalidateQueries({ queryKey: ['hr'] })
      void qc.invalidateQueries({ queryKey: qk.notifications })
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>File a leave request for yourself. Approvers are notified immediately.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ss-type">Leave type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="ss-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ss-start">Start date *</Label>
              <Input id="ss-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ss-end">End date *</Label>
              <Input id="ss-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ss-reason">Reason</Label>
            <Textarea id="ss-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional context for the approver…" rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Duration: {leaveDays(startDate, endDate)} day(s)</p>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Payslips tab ────────────────────────────────────────────────────────────

function MyPayslipsTab({ payslips, structure, name }: {
  payslips: PayslipDetail[]
  structure: StructureInfo | null
  name: string
}) {
  const [viewSlip, setViewSlip] = useState<PayslipDetail | null>(null)

  const columns = useMemo<ColumnDef<PayslipDetail, unknown>[]>(() => [
    {
      accessorKey: 'period',
      header: 'Period',
      cell: ({ row }) => <span className="font-medium">{periodLabel(row.original.period)}</span>,
    },
    { accessorKey: 'grossAmount', header: 'Gross', cell: ({ row }) => <span className="tabular-nums">{formatNaira(row.original.grossAmount)}</span> },
    { accessorKey: 'totalDeductions', header: 'Deductions', cell: ({ row }) => <span className="tabular-nums text-rose-600 dark:text-rose-400">−{formatNaira(row.original.totalDeductions)}</span> },
    { accessorKey: 'netAmount', header: 'Net pay', cell: ({ row }) => <span className="font-semibold tabular-nums">{formatNaira(row.original.netAmount)}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`View payslip for ${periodLabel(row.original.period)}`} onClick={() => setViewSlip(row.original)}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="flex flex-col gap-4">
      {structure && <StructureCard structure={structure} />}
      <DataTable
        columns={columns}
        data={payslips}
        rowId={r => r.id}
        searchPlaceholder="Search periods…"
        searchExtractor={r => periodLabel(r.period)}
        initialPageSize={10}
        emptyState={
          <EmptyState
            icon={Wallet}
            title="No payslips yet"
            description="Your payslips appear here once the office runs payroll."
          />
        }
      />
      <PayslipDialog
        slip={viewSlip ? { ...viewSlip, employeeName: name } : null}
        onOpenChange={o => !o && setViewSlip(null)}
      />
    </div>
  )
}

/** Current salary structure — everything that makes up the monthly gross. */
function StructureCard({ structure }: { structure: StructureInfo }) {
  const allowances = structure.allowances.filter(l => l.amount > 0)
  const deductions = structure.deductions.filter(l => l.amount > 0)
  const gross = structure.basicAmount + allowances.reduce((t, l) => t + l.amount, 0)
  const totalDeductions = deductions.reduce((t, l) => t + l.amount, 0)

  return (
    <section aria-label="Current salary structure" className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BadgeCheck className="h-4 w-4 text-primary" aria-hidden /> Salary structure — {structure.name}
        </h3>
        <p className="text-xs text-muted-foreground">Effective from {prettyDate(structure.effectiveFrom)}</p>
      </div>
      <Separator className="my-3" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly earnings</p>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Basic salary</span>
              <span className="tabular-nums">{formatNaira(structure.basicAmount)}</span>
            </div>
            {allowances.map(l => (
              <div key={l.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="tabular-nums">{formatNaira(l.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-1 font-medium">
              <span>Gross salary</span>
              <span className="tabular-nums">{formatNaira(gross)}</span>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly deductions</p>
          <div className="flex flex-col gap-1 text-sm">
            {deductions.length === 0 && <p className="text-xs text-muted-foreground">None configured.</p>}
            {deductions.map(l => (
              <div key={l.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="tabular-nums">−{formatNaira(l.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5 font-semibold">
              <span>Net (take-home)</span>
              <span className="tabular-nums">{formatNaira(gross - totalDeductions)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
