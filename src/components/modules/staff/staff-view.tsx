'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Archive, BadgeCheck, Banknote, BriefcaseBusiness, CalendarOff, Check, ChevronLeft, ChevronRight,
  Eye, KeyRound, Loader2, Pencil, Plus, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { formatNaira, nairaToKobo } from '@/lib/money'
import {
  LEAVE_TYPE_LABEL, LEAVE_TYPES, STAFF_LOGIN_ROLES,
  leaveDays, periodLabel, periodOf, shiftPeriod,
} from '@/lib/domain/hr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'
import { StatCard } from '@/components/shared/stat-card'
import { PayslipDialog } from '@/components/modules/staff/payslip-document'
import { PageHeader } from '@/components/shared/page-header'

// ── Types ───────────────────────────────────────────────────────────────────

interface SalaryLine { label: string; amount: number }

interface EmployeeRow {
  id: string
  staffCode: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  position: string
  department: string | null
  qualification: string | null
  gender: string | null
  dateOfBirth: string | null
  employmentDate: string
  employmentType: string
  status: string
  userId: string | null
  user: { id: string; email: string; role: string; status: string } | null
  activeSalary: { id: string; name: string; gross: number | null } | null
}

interface StructureRow {
  id: string
  name: string
  basicAmount: number
  allowances: SalaryLine[]
  deductions: SalaryLine[]
  effectiveFrom: string
  isActive: boolean
  gross: number
  net: number
}

interface PayslipRow {
  id: string
  employeeId: string
  employeeName: string
  period: string
  grossAmount: number
  totalDeductions: number
  netAmount: number
  status: string
  paidAt: string | null
  employee: { staffCode: string; position: string; department: string | null }
  items?: { label: string; amount: number; type: string }[]
}

interface PayslipList {
  items: PayslipRow[]
  total: number
  summary: { gross: number; deductions: number; net: number; paidCount: number; draftCount: number; employeeCount: number }
}

interface LeaveRow {
  id: string
  employeeId: string
  employeeName: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  note: string | null
  decidedAt: string | null
  employee: { staffCode: string; position: string; department: string | null }
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  SUSPENDED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  LEFT: 'bg-muted text-muted-foreground',
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

// ── Page ────────────────────────────────────────────────────────────────────

export function StaffView() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff & HR"
        description="Staff directory, payroll runs, salary structures and leave management."
      />
      <Tabs defaultValue="employees" className="gap-4">
        <TabsList>
          <TabsTrigger value="employees" className="gap-1.5"><Users className="h-4 w-4" /> Employees</TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5"><Banknote className="h-4 w-4" /> Payroll</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1.5"><CalendarOff className="h-4 w-4" /> Leave</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-2"><EmployeesTab /></TabsContent>
        <TabsContent value="payroll" className="mt-2"><PayrollTab /></TabsContent>
        <TabsContent value="leave" className="mt-2"><LeaveTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ── Employees tab ───────────────────────────────────────────────────────────

function EmployeesTab() {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('hr.employees.write'))
  const canProvision = useSession(s => s.can('hr.employees.portal'))
  const [department, setDepartment] = useState('all')
  const [status, setStatus] = useState('all')
  const [portal, setPortal] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const [portalTarget, setPortalTarget] = useState<EmployeeRow | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<EmployeeRow | null>(null)

  const filters = useMemo(
    () => ({
      department: department === 'all' ? undefined : department,
      status: status === 'all' ? undefined : status,
      portal: portal === 'all' ? undefined : portal,
      pageSize: 100,
    }),
    [department, status, portal],
  )
  const { data, isLoading } = useQuery({
    queryKey: qk.hrEmployees(filters),
    queryFn: () => api<{ items: EmployeeRow[]; total: number }>('/hr/employees', { query: filters }),
  })

  const archive = useMutation({
    mutationFn: (id: string) => api(`/hr/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Staff member archived — history preserved')
      setArchiveTarget(null)
      void qc.invalidateQueries({ queryKey: ['hr'] })
    },
    onError: e => toast.error(e.message),
  })

  const rows = data?.items ?? []

  const columns = useMemo<ColumnDef<EmployeeRow, unknown>[]>(() => [
    { accessorKey: 'staffCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.staffCode}</span> },
    {
      accessorKey: 'lastName',
      header: 'Name',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.email ?? '—'}</p>
        </div>
      ),
    },
    { accessorKey: 'position', header: 'Position' },
    { accessorKey: 'department', header: 'Department', cell: ({ row }) => row.original.department ?? '—' },
    { accessorKey: 'employmentType', header: 'Type', cell: ({ row }) => <span className="text-xs">{row.original.employmentType.replace('_', ' ')}</span> },
    {
      id: 'gross',
      header: 'Monthly gross',
      cell: ({ row }) => row.original.activeSalary?.gross != null
        ? <span className="font-medium tabular-nums">{formatNaira(row.original.activeSalary.gross)}</span>
        : <span className="text-xs text-muted-foreground">No structure</span>,
    },
    {
      id: 'portal',
      header: 'Portal',
      cell: ({ row }) => row.original.user
        ? <Badge variant="outline" className="gap-1 border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><BadgeCheck className="h-3 w-3" /> {row.original.user.role}</Badge>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${row.original.fullName}`} onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          {canProvision && (
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Portal access for ${row.original.fullName}`} onClick={() => setPortalTarget(row.original)}>
              <KeyRound className="h-4 w-4" />
            </Button>
          )}
          {canWrite && row.original.status === 'ACTIVE' && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Archive ${row.original.fullName}`} onClick={() => setArchiveTarget(row.original)}>
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, canProvision])

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search staff…"
        searchExtractor={r => `${r.fullName} ${r.staffCode} ${r.email ?? ''} ${r.position}`}
        onRowClick={r => setDetailId(r.id)}
        initialPageSize={10}
        emptyState={
          <EmptyState
            icon={Users}
            title="No staff found"
            description={canWrite ? 'Onboard your first staff member to get started.' : 'No staff match the current filters.'}
            action={canWrite ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add staff</Button>
            ) : undefined}
          />
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                <SelectItem value="Academic">Academic</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Ancillary">Ancillary</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[130px]" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="LEFT">Left</SelectItem>
              </SelectContent>
            </Select>
            <Select value={portal} onValueChange={setPortal}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by portal access"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any portal access</SelectItem>
                <SelectItem value="linked">Has login</SelectItem>
                <SelectItem value="unlinked">No login</SelectItem>
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add staff</Button>
            )}
          </div>
        }
      />

      <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <PortalAccessDialog target={portalTarget} onOpenChange={o => !o && setPortalTarget(null)} />
      {detailId && <EmployeeDetailDialog employeeId={detailId} onOpenChange={o => !o && setDetailId(null)} />}
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={o => !o && setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.fullName ?? 'staff member'}?`}
        description="The record is marked as LEFT. Payslip and leave history are preserved; the staff member disappears from pickers and payroll runs."
        confirmLabel="Archive"
        destructive
        onConfirm={() => archiveTarget ? archive.mutateAsync(archiveTarget.id) : Promise.resolve()}
      />
    </div>
  )
}

// ── Employee create/edit dialog ─────────────────────────────────────────────

function EmployeeDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: EmployeeRow | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(() => ({
    firstName: editing?.firstName ?? '',
    lastName: editing?.lastName ?? '',
    gender: editing?.gender ?? '',
    dateOfBirth: editing?.dateOfBirth ?? '',
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    position: editing?.position ?? '',
    department: editing?.department ?? 'Academic',
    qualification: editing?.qualification ?? '',
    employmentDate: editing?.employmentDate ?? new Date().toISOString().slice(0, 10),
    employmentType: editing?.employmentType ?? 'FULL_TIME',
    status: editing?.status ?? 'ACTIVE',
  }))
  const [error, setError] = useState<string | undefined>()
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => api(editing ? `/hr/employees/${editing.id}` : '/hr/employees', {
      method: editing ? 'PATCH' : 'POST',
      body: {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        department: form.department || undefined,
        qualification: form.qualification || undefined,
        gender: form.gender || undefined,
      },
    }),
    onSuccess: () => {
      toast.success(editing ? 'Staff member updated' : 'Staff member onboarded — staff code auto-assigned')
      onOpenChange(false)
      void qc.invalidateQueries({ queryKey: ['hr'] })
      void qc.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.fullName}` : 'Onboard staff member'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update employment and contact details.' : 'A staff code (STF-####) is assigned automatically.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="emp-first">First name *</Label>
            <Input id="emp-first" value={form.firstName} onChange={e => set('firstName')(e.target.value)} placeholder="Tunde" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-last">Last name *</Label>
            <Input id="emp-last" value={form.lastName} onChange={e => set('lastName')(e.target.value)} placeholder="Adeyemi" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-position">Position *</Label>
            <Input id="emp-position" value={form.position} onChange={e => set('position')(e.target.value)} placeholder="Teacher" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-dept">Department</Label>
            <Select value={form.department || 'none'} onValueChange={v => set('department')(v === 'none' ? '' : v)}>
              <SelectTrigger id="emp-dept"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Academic">Academic</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Ancillary">Ancillary</SelectItem>
                <SelectItem value="none">No department</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-email">Email</Label>
            <Input id="emp-email" type="email" value={form.email} onChange={e => set('email')(e.target.value)} placeholder="tunde@schooldesk.ng" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-phone">Phone</Label>
            <Input id="emp-phone" value={form.phone} onChange={e => set('phone')(e.target.value)} placeholder="+234 803 000 0000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-gender">Gender</Label>
            <Select value={form.gender || 'none'} onValueChange={v => set('gender')(v === 'none' ? '' : v)}>
              <SelectTrigger id="emp-gender"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Prefer not to say</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-dob">Date of birth</Label>
            <Input id="emp-dob" type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth')(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-employed">Employment date *</Label>
            <Input id="emp-employed" type="date" value={form.employmentDate} onChange={e => set('employmentDate')(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-type">Employment type</Label>
            <Select value={form.employmentType} onValueChange={set('employmentType')}>
              <SelectTrigger id="emp-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full time</SelectItem>
                <SelectItem value="PART_TIME">Part time</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="emp-qual">Qualification</Label>
            <Input id="emp-qual" value={form.qualification} onChange={e => set('qualification')(e.target.value)} placeholder="B.Ed, PGDE…" />
          </div>
          {editing && (
            <div className="grid gap-1.5">
              <Label htmlFor="emp-status">Status</Label>
              <Select value={form.status} onValueChange={set('status')}>
                <SelectTrigger id="emp-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="LEFT">Left</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save changes' : 'Onboard staff'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Portal access dialog ────────────────────────────────────────────────────

function PortalAccessDialog({ target, onOpenChange }: {
  target: EmployeeRow | null
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const linked = !!target?.user
  const [role, setRole] = useState('TEACHER')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [granted, setGranted] = useState<{ email?: string; temporaryPassword?: string } | null>(null)

  const submit = useMutation({
    mutationFn: () => api<{ userId: string; email?: string; temporaryPassword?: string }>(`/hr/employees/${target!.id}/portal-access`, {
      method: 'POST',
      body: linked
        ? { action: 'RESET_PASSWORD', ...(password ? { password } : {}) }
        : { action: 'CREATE_LOGIN', role, email: email || undefined, ...(password ? { password } : {}) },
    }),
    onSuccess: res => {
      setGranted({ email: res.email, temporaryPassword: res.temporaryPassword })
      toast.success(linked ? 'Password reset' : 'Portal login created')
      void qc.invalidateQueries({ queryKey: ['hr'] })
    },
    onError: e => setError(e.message),
  })

  const close = (o: boolean) => {
    if (!o) { setGranted(null); setError(undefined); setPassword(''); setEmail('') }
    onOpenChange(o)
  }

  return (
    <Dialog open={!!target} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{linked ? 'Reset portal password' : 'Grant portal login'}</DialogTitle>
          <DialogDescription>
            {linked
              ? `${target?.fullName} signs in as ${target?.user?.email}.`
              : `Create a staff login for ${target?.fullName ?? ''}.`}
          </DialogDescription>
        </DialogHeader>
        {granted ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {granted.temporaryPassword
                ? 'Share this one-time password with the staff member — it is shown only once.'
                : 'The custom password was set.'}
            </p>
            {granted.temporaryPassword && (
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="font-mono text-lg font-semibold tracking-wide">{granted.temporaryPassword}</p>
              </div>
            )}
            {granted.email && <p className="text-sm">Login email: <span className="font-medium">{granted.email}</span></p>}
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              {!linked && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pa-role">Portal role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="pa-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAFF_LOGIN_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!linked && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pa-email">Login email</Label>
                  <Input id="pa-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={target?.email ?? 'name@schooldesk.ng'} />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="pa-pass">Password <span className="text-xs text-muted-foreground">(leave blank to auto-generate a one-time password)</span></Label>
                <Input id="pa-pass" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={8} />
              </div>
            </div>
            {error && <FieldError message={error} />}
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {linked ? 'Reset password' : 'Create login'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Employee detail dialog (profile + salary structures) ────────────────────

interface EmployeeDetail extends EmployeeRow {
  user: { id: string; email: string; role: string; status: string; lastLoginAt: string | null } | null
  salaryStructures: StructureRow[]
  payslips: PayslipRow[]
  leaveRequests: LeaveRow[]
}

function EmployeeDetailDialog({ employeeId, onOpenChange }: {
  employeeId: string
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('hr.salaries.write'))
  const { data: emp, isLoading } = useQuery({
    queryKey: qk.hrEmployee(employeeId),
    queryFn: () => api<EmployeeDetail>(`/hr/employees/${employeeId}`),
  })
  const [showStructureForm, setShowStructureForm] = useState(false)

  const activate = useMutation({
    mutationFn: (id: string) => api(`/hr/salary-structures/${id}`, { method: 'PATCH', body: { isActive: true } }),
    onSuccess: () => { toast.success('Salary structure activated'); void qc.invalidateQueries({ queryKey: ['hr'] }) },
    onError: e => toast.error(e.message),
  })
  const removeStructure = useMutation({
    mutationFn: (id: string) => api(`/hr/salary-structures/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Salary structure deleted'); void qc.invalidateQueries({ queryKey: ['hr'] }) },
    onError: e => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{emp?.fullName ?? 'Staff profile'}</DialogTitle>
          <DialogDescription>
            {emp ? `${emp.staffCode} · ${emp.position}${emp.department ? ` · ${emp.department}` : ''}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !emp ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Employment</p><p>{prettyDate(emp.employmentDate)} · {emp.employmentType.replace('_', ' ')}</p></div>
              <div><p className="mb-1 text-xs text-muted-foreground">Status</p><StatusBadge status={emp.status} /></div>
              <div><p className="text-xs text-muted-foreground">Portal login</p>
                {emp.user
                  ? <span className="inline-flex items-center gap-1 truncate text-emerald-600 dark:text-emerald-400"><BadgeCheck className="h-4 w-4 shrink-0" />{emp.user.email}</span>
                  : <span className="text-muted-foreground">Not linked</span>}
              </div>
              <div><p className="text-xs text-muted-foreground">Email</p><p className="truncate">{emp.email ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Phone</p><p>{emp.phone ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Qualification</p><p className="truncate">{emp.qualification ?? '—'}</p></div>
            </div>

            <Separator />

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Salary structures</h3>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={() => setShowStructureForm(v => !v)}>
                    <Plus className="h-4 w-4" /> {showStructureForm ? 'Close form' : 'Add structure'}
                  </Button>
                )}
              </div>
              {showStructureForm && (
                <StructureForm employeeId={employeeId} onDone={() => setShowStructureForm(false)} />
              )}
              {emp.salaryStructures.length === 0 && (
                <p className="text-sm text-muted-foreground">No salary structure yet — payroll runs skip staff without one.</p>
              )}
              <div className="flex flex-col gap-2">
                {emp.salaryStructures.map(s => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {s.name}
                        {s.isActive && <Badge variant="outline" className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Active</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From {prettyDate(s.effectiveFrom)} · Basic {formatNaira(s.basicAmount)} · Gross {formatNaira(s.gross)} · Net {formatNaira(s.net)}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1">
                        {!s.isActive && (
                          <Button size="sm" variant="outline" onClick={() => activate.mutate(s.id)} disabled={activate.isPending}>
                            <BadgeCheck className="h-4 w-4" /> Activate
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Delete ${s.name}`} onClick={() => removeStructure.mutate(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {(emp.payslips.length > 0 || emp.leaveRequests.length > 0) && <Separator />}

            {emp.payslips.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Recent payslips</h3>
                <div className="flex flex-wrap gap-2">
                  {emp.payslips.map(p => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                      <span className="font-medium">{periodLabel(p.period)}</span>
                      <span className="tabular-nums">{formatNaira(p.netAmount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {emp.leaveRequests.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Recent leave requests</h3>
                <div className="flex flex-wrap gap-2">
                  {emp.leaveRequests.map(r => (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                      <span>{LEAVE_TYPE_LABEL[r.type] ?? r.type}</span>
                      <span className="text-muted-foreground">{r.startDate} → {r.endDate}</span>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Allowance/deduction line editor — label + naira amount rows. */
function SalaryLinesEditor({ label, lines, onChange }: {
  label: string
  lines: SalaryLine[]
  onChange: (lines: SalaryLine[]) => void
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={line.label}
            onChange={e => onChange(lines.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
            placeholder="Housing"
            aria-label={`${label} line ${i + 1} label`}
          />
          <Input
            type="number"
            min={0}
            className="w-36"
            value={line.amount === 0 ? '' : line.amount / 100}
            onChange={e => onChange(lines.map((l, j) => j === i ? { ...l, amount: nairaToKobo(Number(e.target.value) || 0) } : l))}
            placeholder="₦"
            aria-label={`${label} line ${i + 1} amount in naira`}
          />
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" aria-label={`Remove ${label} line ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...lines, { label: '', amount: 0 }])}>
        <Plus className="h-4 w-4" /> Add line
      </Button>
    </div>
  )
}

function StructureForm({ employeeId, onDone }: { employeeId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [basic, setBasic] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [isActive, setIsActive] = useState(true)
  const [allowances, setAllowances] = useState<SalaryLine[]>([{ label: 'Housing', amount: 0 }])
  const [deductions, setDeductions] = useState<SalaryLine[]>([])
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    mutationFn: () => api('/hr/salary-structures', {
      method: 'POST',
      body: {
        employeeId,
        name,
        basicAmount: nairaToKobo(Number(basic) || 0),
        allowances: allowances.filter(l => l.label && l.amount > 0),
        deductions: deductions.filter(l => l.label && l.amount > 0),
        effectiveFrom,
        isActive,
      },
    }),
    onSuccess: () => {
      toast.success('Salary structure saved')
      void qc.invalidateQueries({ queryKey: ['hr'] })
      onDone()
    },
    onError: e => setError(e.message),
  })

  return (
    <form
      className="grid gap-4 rounded-lg border bg-muted/30 p-4"
      onSubmit={e => { e.preventDefault(); setError(undefined); save.mutate() }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="st-name">Structure name *</Label>
          <Input id="st-name" value={name} onChange={e => setName(e.target.value)} placeholder="Main scale 2025" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="st-basic">Basic salary (₦/month) *</Label>
          <Input id="st-basic" type="number" min={0} value={basic} onChange={e => setBasic(e.target.value)} placeholder="140000" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="st-eff">Effective from *</Label>
          <Input id="st-eff" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required />
        </div>
      </div>
      <SalaryLinesEditor label="Allowances (₦/month)" lines={allowances} onChange={setAllowances} />
      <SalaryLinesEditor label="Deductions (₦/month)" lines={deductions} onChange={setDeductions} />
      <div className="flex items-center gap-2">
        <Switch id="st-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="st-active" className="font-normal">Set as the active structure {isActive && <span className="text-xs text-muted-foreground">(deactivates the previous one)</span>}</Label>
      </div>
      {error && <FieldError message={error} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save structure
        </Button>
      </div>
    </form>
  )
}

// ── Payroll tab ─────────────────────────────────────────────────────────────

function PayrollTab() {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('hr.payroll.write'))
  const canSettle = useSession(s => s.can('hr.payroll.settle'))
  const [period, setPeriod] = useState(periodOf())
  const [status, setStatus] = useState('all')
  const [viewSlip, setViewSlip] = useState<PayslipRow | null>(null)
  const [markTarget, setMarkTarget] = useState<PayslipRow | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)

  const filters = useMemo(
    () => ({ period, status: status === 'all' ? undefined : status, pageSize: 100 }),
    [period, status],
  )
  const { data, isLoading } = useQuery({
    queryKey: qk.payslips(filters),
    queryFn: () => api<PayslipList>('/hr/payslips', { query: filters }),
  })

  const generate = useMutation({
    mutationFn: () => api<{ created: number; skipped: number }>('/hr/payslips/generate', { method: 'POST', body: { period } }),
    onSuccess: res => {
      toast.success(`Generated ${res.created} payslip(s)${res.skipped ? ` · ${res.skipped} already existed` : ''}`)
      setGenerateOpen(false)
      void qc.invalidateQueries({ queryKey: ['hr'] })
    },
    onError: e => { setGenerateOpen(false); toast.error(e.message) },
  })

  const markPaid = useMutation({
    mutationFn: (id: string) => api(`/hr/payslips/${id}/mark-paid`, { method: 'PATCH' }),
    onSuccess: () => {
      toast.success('Payslip settled — salary expense posted to the ledger')
      setMarkTarget(null)
      void qc.invalidateQueries({ queryKey: ['hr'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: e => toast.error(e.message),
  })

  const summary = data?.summary
  const rows = data?.items ?? []

  const columns = useMemo<ColumnDef<PayslipRow, unknown>[]>(() => [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.employeeName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.employee.staffCode} · {row.original.employee.position}</p>
        </div>
      ),
    },
    { id: 'department', header: 'Department', cell: ({ row }) => row.original.employee.department ?? '—' },
    { accessorKey: 'grossAmount', header: 'Gross', cell: ({ row }) => <span className="tabular-nums">{formatNaira(row.original.grossAmount)}</span> },
    { accessorKey: 'totalDeductions', header: 'Deductions', cell: ({ row }) => <span className="tabular-nums text-rose-600 dark:text-rose-400">−{formatNaira(row.original.totalDeductions)}</span> },
    { accessorKey: 'netAmount', header: 'Net pay', cell: ({ row }) => <span className="font-semibold tabular-nums">{formatNaira(row.original.netAmount)}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`View payslip for ${row.original.employeeName}`} onClick={() => setViewSlip(row.original)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canSettle && row.original.status === 'DRAFT' && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setMarkTarget(row.original)}>
              <Check className="h-4 w-4" /> Mark paid
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, canSettle])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Previous month" onClick={() => setPeriod(p => shiftPeriod(p, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-44 text-center text-sm font-semibold">{periodLabel(period)}</div>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Next month" onClick={() => setPeriod(p => shiftPeriod(p, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by payment status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
          {canWrite && (
            <Button onClick={() => setGenerateOpen(true)}>
              <Banknote className="h-4 w-4" /> Generate payslips
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Employees" value={summary?.employeeCount ?? 0} icon={Users} loading={isLoading} hint={`${summary?.draftCount ?? 0} draft · ${summary?.paidCount ?? 0} paid`} />
        <StatCard label="Gross payroll" value={formatNaira(summary?.gross ?? 0, { compact: true })} icon={Banknote} loading={isLoading} tone="primary" />
        <StatCard label="Deductions" value={formatNaira(summary?.deductions ?? 0, { compact: true })} icon={X} loading={isLoading} tone="warning" />
        <StatCard label="Net payable" value={formatNaira(summary?.net ?? 0, { compact: true })} icon={BadgeCheck} loading={isLoading} tone="success" hint={`${summary?.paidCount ?? 0} settled`} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search employees…"
        searchExtractor={r => `${r.employeeName} ${r.employee.staffCode}`}
        initialPageSize={10}
        emptyState={
          <EmptyState
            icon={Banknote}
            title={`No payslips for ${periodLabel(period)}`}
            description="Generate the payroll run to create DRAFT payslips from every active salary structure."
            action={canWrite ? <Button onClick={() => setGenerateOpen(true)}><Banknote className="h-4 w-4" /> Generate payslips</Button> : undefined}
          />
        }
      />

      <PayslipDialog slip={viewSlip} onOpenChange={o => !o && setViewSlip(null)} />

      <ConfirmDialog
        open={!!markTarget}
        onOpenChange={o => !o && setMarkTarget(null)}
        title={`Mark ${markTarget?.employeeName ?? ''} as paid?`}
        description={`Net pay ${formatNaira(markTarget?.netAmount ?? 0)} for ${markTarget ? periodLabel(markTarget.period) : ''} will be posted to the ledger as a SALARIES expense.`}
        confirmLabel="Mark paid"
        onConfirm={() => markTarget ? markPaid.mutateAsync(markTarget.id) : Promise.resolve()}
      />

      <ConfirmDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title={`Generate payslips for ${periodLabel(period)}?`}
        description="Creates DRAFT payslips from every active staff member's active salary structure. Existing payslips for this period are skipped, so re-running is safe."
        confirmLabel="Generate"
        onConfirm={() => generate.mutateAsync()}
      />
    </div>
  )
}

// ── Leave tab ───────────────────────────────────────────────────────────────

function LeaveTab() {
  const qc = useQueryClient()
  const canDecide = useSession(s => s.can('hr.leave.write'))
  const [status, setStatus] = useState('PENDING')
  const [fileOpen, setFileOpen] = useState(false)
  const [decideTarget, setDecideTarget] = useState<{ row: LeaveRow; decision: 'APPROVED' | 'REJECTED' } | null>(null)

  const filters = useMemo(() => ({ status: status === 'all' ? undefined : status, pageSize: 50 }), [status])
  const { data, isLoading } = useQuery({
    queryKey: qk.leaveRequests(filters),
    queryFn: () => api<{ items: LeaveRow[]; total: number }>('/hr/leave-requests', { query: filters }),
  })

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) =>
      api(`/hr/leave-requests/${id}/decide`, { method: 'POST', body: { decision, note: note || undefined } }),
    onSuccess: (_res, vars) => {
      toast.success(`Request ${vars.decision === 'APPROVED' ? 'approved' : 'rejected'} — the staff member has been notified`)
      setDecideTarget(null)
      void qc.invalidateQueries({ queryKey: ['hr'] })
    },
    onError: e => toast.error(e.message),
  })

  const rows = data?.items ?? []

  const columns = useMemo<ColumnDef<LeaveRow, unknown>[]>(() => [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.employeeName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.employee.staffCode} · {row.original.employee.position}</p>
        </div>
      ),
    },
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
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => canDecide && row.original.status === 'PENDING' ? (
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="h-8 text-emerald-600 dark:text-emerald-400" aria-label={`Approve ${row.original.employeeName}'s leave`} onClick={() => setDecideTarget({ row: row.original, decision: 'APPROVED' })}>
            <Check className="h-4 w-4" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-rose-600 dark:text-rose-400" aria-label={`Reject ${row.original.employeeName}'s leave`} onClick={() => setDecideTarget({ row: row.original, decision: 'REJECTED' })}>
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      ) : null,
    },
  ], [canDecide])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by leave status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {canDecide && (
          <Button onClick={() => setFileOpen(true)}><UserPlus className="h-4 w-4" /> File request</Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search requests…"
        searchExtractor={r => `${r.employeeName} ${LEAVE_TYPE_LABEL[r.type] ?? r.type}`}
        initialPageSize={10}
        emptyState={
          <EmptyState
            icon={CalendarOff}
            title="No leave requests"
            description={status === 'PENDING' ? 'Nothing awaits your decision — enjoy the quiet.' : 'No requests match the current filter.'}
            action={canDecide ? <Button variant="outline" onClick={() => setFileOpen(true)}><Plus className="h-4 w-4" /> File request</Button> : undefined}
          />
        }
      />

      <LeaveDialog open={fileOpen} onOpenChange={setFileOpen} />

      {decideTarget && (
        <DecideDialog
          target={decideTarget}
          onClose={() => setDecideTarget(null)}
          onDecide={(note) => decide.mutateAsync({ id: decideTarget.row.id, decision: decideTarget.decision, note })
            .then(() => setDecideTarget(null))
            .catch(() => { /* toast shown by caller */ })}
          busy={decide.isPending}
        />
      )}
    </div>
  )
}

/** Approve/reject with an optional decision note. */
function DecideDialog({ target, onClose, onDecide, busy }: {
  target: { row: LeaveRow; decision: 'APPROVED' | 'REJECTED' }
  onClose: () => void
  onDecide: (note: string) => Promise<void>
  busy: boolean
}) {
  const [note, setNote] = useState('')
  const approve = target.decision === 'APPROVED'
  const days = leaveDays(target.row.startDate, target.row.endDate)
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{approve ? 'Approve' : 'Reject'} {target.row.employeeName}&apos;s leave?</DialogTitle>
          <DialogDescription>
            {LEAVE_TYPE_LABEL[target.row.type] ?? target.row.type} · {target.row.startDate} → {target.row.endDate} ({days} day{days === 1 ? '' : 's'})
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="dec-note">Decision note <span className="text-xs text-muted-foreground">(optional, shared with the staff member)</span></Label>
          <Textarea id="dec-note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. Coverage arranged with Mr. Musa" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onDecide(note)}
            disabled={busy}
            className={approve ? undefined : 'bg-destructive text-white hover:bg-destructive/90'}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LeaveDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState('ANNUAL')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  const { data: staff } = useQuery({
    queryKey: qk.hrEmployees({ status: 'ACTIVE', pageSize: 200 }),
    queryFn: () => api<{ items: EmployeeRow[] }>('/hr/employees', { query: { status: 'ACTIVE', pageSize: 200 } }),
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () => api('/hr/leave-requests', {
      method: 'POST',
      body: { employeeId: employeeId || undefined, type, startDate, endDate, reason: reason || undefined },
    }),
    onSuccess: () => {
      toast.success('Leave request filed — pending decision')
      onOpenChange(false)
      setReason('')
      void qc.invalidateQueries({ queryKey: ['hr'] })
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>File leave request</DialogTitle>
          <DialogDescription>Submit a leave request on behalf of a staff member.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lv-emp">Staff member *</Label>
            <Select value={employeeId || undefined} onValueChange={setEmployeeId}>
              <SelectTrigger id="lv-emp"><SelectValue placeholder="Pick staff member" /></SelectTrigger>
              <SelectContent>
                {(staff?.items ?? []).map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.fullName} — {e.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lv-type">Leave type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="lv-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lv-start">Start date *</Label>
              <Input id="lv-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lv-end">End date *</Label>
              <Input id="lv-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lv-reason">Reason</Label>
            <Textarea id="lv-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional context for the approver…" rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Duration: {leaveDays(startDate, endDate)} day(s)</p>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !employeeId}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
