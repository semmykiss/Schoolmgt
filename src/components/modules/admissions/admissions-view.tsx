'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarClock, ClipboardList, GraduationCap, Loader2, MoreHorizontal, Plus,
  ThumbsUp, Trash2, XCircle,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'
import { fmtDate } from '@/components/modules/academics/academic-helpers'

interface ApplicantRow {
  id: string; applicationNumber: string; firstName: string; lastName: string
  gender: string; status: string; interviewAt: string | null; decidedAt: string | null
  admittedStudentId: string | null
  parentName: string; parentPhone: string; previousSchool: string | null
  classApplied: { id: string; name: string } | null
}

const STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  APPLIED: { label: 'Applied', chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/40', dot: 'bg-sky-500' },
  INTERVIEW: { label: 'Interview', chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40', dot: 'bg-amber-500' },
  ADMITTED: { label: 'Admitted', chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-500' },
  WAITLISTED: { label: 'Waitlisted', chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/40', dot: 'bg-violet-500' },
  REJECTED: { label: 'Rejected', chip: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/40', dot: 'bg-red-500' },
}

const createSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  gender: z.enum(['MALE', 'FEMALE']),
  parentName: z.string().trim().min(2, 'Parent/guardian name is required').max(120),
  parentPhone: z.string().trim().regex(/^(\+?234|0)[\d\s-]{7,14}$/, 'e.g. 0803 000 0000'),
  parentEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  classAppliedId: z.string(),
  previousSchool: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
})
type CreateValues = z.infer<typeof createSchema>

const convertSchema = z.object({
  classId: z.string().min(1, 'Choose a class'),
  sectionId: z.string(),
  admissionDate: z.string().min(1, 'Pick the admission date'),
})
type ConvertValues = z.infer<typeof convertSchema>

// ── create dialog ───────────────────────────────────────────────────────────
function CreateApplicantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/academics/classes'),
    enabled: open,
  })
  const classes = classesData?.items ?? []

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { firstName: '', lastName: '', gender: 'MALE', parentName: '', parentPhone: '', parentEmail: '', classAppliedId: 'NONE', previousSchool: '', notes: '' },
  })
  const errs = form.formState.errors

  const create = useMutation({
    mutationFn: (v: CreateValues) => api<{ applicationNumber: string }>('/admissions/applicants', {
      method: 'POST',
      body: {
        ...v,
        classAppliedId: v.classAppliedId === 'NONE' ? null : v.classAppliedId,
        parentEmail: v.parentEmail || undefined,
        previousSchool: v.previousSchool || undefined,
        notes: v.notes || undefined,
      },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['admissions'] })
      toast.success(`Application received — ${r.applicationNumber}`)
      onOpenChange(false)
      form.reset()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not save application'),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!create.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>Walk-in application — a number like APP-2026-0007 is assigned automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => create.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-first">First name</Label>
              <Input id="ap-first" {...form.register('firstName')} />
              <FieldError message={errs.firstName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-last">Last name</Label>
              <Input id="ap-last" {...form.register('lastName')} />
              <FieldError message={errs.lastName?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Controller name="gender" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-class">Class applying for</Label>
              <Controller name="classAppliedId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ap-class" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not decided</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-pname">Parent/guardian name</Label>
              <Input id="ap-pname" {...form.register('parentName')} />
              <FieldError message={errs.parentName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-pphone">Parent phone</Label>
              <Input id="ap-pphone" type="tel" placeholder="0803 000 0000" {...form.register('parentPhone')} />
              <FieldError message={errs.parentPhone?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-pemail">Parent email <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="ap-pemail" type="email" {...form.register('parentEmail')} />
              <FieldError message={errs.parentEmail?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-prev">Previous school <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="ap-prev" {...form.register('previousSchool')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="ap-notes" rows={2} {...form.register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Receive application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── convert dialog ──────────────────────────────────────────────────────────
function ConvertDialog({ applicant, onClose }: { applicant: ApplicantRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string; sections: { id: string; name: string }[] }[] }>('/academics/classes'),
    enabled: applicant !== null,
  })
  const classes = classesData?.items ?? []

  const form = useForm<ConvertValues>({
    resolver: zodResolver(convertSchema),
    defaultValues: { classId: '', sectionId: 'NONE', admissionDate: new Date().toISOString().slice(0, 10) },
  })
  const [seenFor, setSeenFor] = useState<string | null>(null)
  if (applicant && seenFor !== applicant.id) {
    setSeenFor(applicant.id)
    form.reset({
      classId: applicant.classApplied?.id ?? '',
      sectionId: 'NONE',
      admissionDate: new Date().toISOString().slice(0, 10),
    })
  }
  const classId = form.watch('classId')
  const sections = classes.find(c => c.id === classId)?.sections ?? []
  const errs = form.formState.errors

  const convert = useMutation({
    mutationFn: (v: ConvertValues) => api<{ admissionNumber: string }>(`/admissions/applicants/${applicant?.id}/convert`, {
      method: 'POST',
      body: { classId: v.classId, sectionId: v.sectionId === 'NONE' ? null : v.sectionId, admissionDate: v.admissionDate, createPortalLogin: false },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['admissions'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${applicant?.firstName} enrolled as ${r.admissionNumber}`)
      onClose()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Conversion failed'),
  })

  return (
    <Dialog open={applicant !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enrol {applicant?.firstName} {applicant?.lastName}</DialogTitle>
          <DialogDescription>Creates the student record with an auto admission number and closes this application.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => convert.mutate(v))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Controller name="classId" control={form.control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose class" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )} />
            <FieldError message={errs.classId?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Controller name="sectionId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unassigned</SelectItem>
                    {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-date">Admission date</Label>
              <Input id="cv-date" type="date" {...form.register('admissionDate')} />
              <FieldError message={errs.admissionDate?.message} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={convert.isPending}>Cancel</Button>
            <Button type="submit" disabled={convert.isPending}>
              {convert.isPending && <Loader2 className="animate-spin" aria-hidden />}
              <GraduationCap aria-hidden /> Enrol student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── main view ───────────────────────────────────────────────────────────────
export function AdmissionsView() {
  const canWrite = useSession(s => s.can('admissions.write'))
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [convertTarget, setConvertTarget] = useState<ApplicantRow | null>(null)
  const [interviewTarget, setInterviewTarget] = useState<ApplicantRow | null>(null)
  const [interviewDate, setInterviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [deleteTarget, setDeleteTarget] = useState<ApplicantRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.applicants({ status: statusFilter }),
    queryFn: () => api<{ items: ApplicantRow[]; counts: Record<string, number> }>('/admissions/applicants', {
      query: { status: statusFilter === 'ALL' ? undefined : statusFilter },
    }),
  })
  const applicants = data?.items ?? []
  const counts = data?.counts ?? {}

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admissions/applicants/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['admissions'] })
      toast.success(v.status === 'REJECTED' ? 'Application rejected' : `Moved to ${STATUS_META[v.status]?.label ?? v.status}`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Update failed'),
  })
  const scheduleInterview = useMutation({
    mutationFn: () => api(`/admissions/applicants/${interviewTarget?.id}`, { method: 'PATCH', body: { status: 'INTERVIEW', interviewAt: interviewDate } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions'] })
      toast.success(`Interview scheduled for ${fmtDate(interviewDate)}`)
      setInterviewTarget(null)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })
  const removeApplicant = useMutation({
    mutationFn: (id: string) => api(`/admissions/applicants/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions'] })
      toast.success('Application deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<ApplicantRow, unknown>[]>(() => [
    {
      id: 'applicant',
      accessorFn: r => `${r.lastName} ${r.firstName}`,
      header: 'Applicant',
      meta: { label: 'Applicant' },
      cell: ({ row }) => (
        <div>
          <p className="font-medium leading-tight">{row.original.firstName} {row.original.lastName}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.applicationNumber}</p>
        </div>
      ),
    },
    {
      id: 'class',
      accessorFn: r => r.classApplied?.name ?? '',
      header: 'Applying for',
      meta: { label: 'Applying for' },
      cell: ({ row }) => row.original.classApplied?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'parentName',
      header: 'Parent',
      meta: { label: 'Parent' },
      cell: ({ row }) => (
        <div>
          <p>{row.original.parentName}</p>
          <p className="text-xs text-muted-foreground">{row.original.parentPhone}</p>
        </div>
      ),
    },
    {
      accessorKey: 'interviewAt',
      header: 'Interview',
      meta: { label: 'Interview' },
      cell: ({ row }) => row.original.interviewAt ? fmtDate(row.original.interviewAt) : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'status',
      header: 'Stage',
      meta: { label: 'Stage' },
      cell: ({ row }) => {
        const meta = STATUS_META[row.original.status]
        return meta ? (
          <Badge variant="outline" className={`gap-1.5 ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {meta.label}
          </Badge>
        ) : row.original.status
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const a = row.original
        if (!canWrite) return null
        if (a.admittedStudentId) return <Badge variant="outline" className="text-muted-foreground">Converted</Badge>
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${a.firstName}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {a.status !== 'INTERVIEW' && (
                <DropdownMenuItem onSelect={() => { setInterviewTarget(a); setInterviewDate(new Date().toISOString().slice(0, 10)) }}>
                  <CalendarClock aria-hidden /> Schedule interview
                </DropdownMenuItem>
              )}
              {a.status !== 'ADMITTED' && (
                <DropdownMenuItem onSelect={() => setConvertTarget(a)}>
                  <GraduationCap aria-hidden /> Convert to student
                </DropdownMenuItem>
              )}
              {a.status !== 'WAITLISTED' && (
                <DropdownMenuItem onSelect={() => setStatus.mutate({ id: a.id, status: 'WAITLISTED' })}>
                  <ThumbsUp aria-hidden /> Move to waitlist
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {a.status !== 'REJECTED' && (
                <DropdownMenuItem variant="destructive" onSelect={() => setStatus.mutate({ id: a.id, status: 'REJECTED' })}>
                  <XCircle aria-hidden /> Reject application
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(a)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite, setStatus])

  const pipeline = ['APPLIED', 'INTERVIEW', 'ADMITTED', 'WAITLISTED', 'REJECTED'] as const

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {pipeline.map(stage => {
          const meta = STATUS_META[stage]
          const active = statusFilter === stage
          return (
            <button
              key={stage} type="button"
              onClick={() => setStatusFilter(active ? 'ALL' : stage)}
              aria-pressed={active}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{counts[stage] ?? 0}</p>
            </button>
          )
        })}
      </div>

      <DataTable<ApplicantRow>
        columns={columns}
        data={applicants}
        loading={isLoading}
        rowId={a => a.id}
        searchPlaceholder="Search name, number or parent…"
        searchExtractor={a => `${a.firstName} ${a.lastName} ${a.applicationNumber} ${a.parentName}`}
        initialPageSize={15}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All stages</SelectItem>
                {pipeline.map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden /> New application
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title={statusFilter === 'ALL' ? 'No applications yet' : `No ${STATUS_META[statusFilter]?.label.toLowerCase() ?? ''} applications`}
            description="Applications arrive here — schedule interviews, then convert admitted applicants into students."
            action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus aria-hidden /> New application</Button> : undefined}
          />
        }
      />

      <CreateApplicantDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConvertDialog applicant={convertTarget} onClose={() => setConvertTarget(null)} />

      <Dialog open={interviewTarget !== null} onOpenChange={o => { if (!o) setInterviewTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
            <DialogDescription>{interviewTarget?.firstName} {interviewTarget?.lastName} — parent {interviewTarget?.parentPhone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="iv-date">Interview date</Label>
              <Input id="iv-date" type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInterviewTarget(null)}>Cancel</Button>
              <Button onClick={() => scheduleInterview.mutate()} disabled={scheduleInterview.isPending}>
                {scheduleInterview.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Schedule
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title="Delete this application?"
        description={`${deleteTarget?.firstName} ${deleteTarget?.lastName} (${deleteTarget?.applicationNumber}) will be removed permanently.`}
        confirmLabel="Delete application" destructive
        onConfirm={async () => { if (deleteTarget) await removeApplicant.mutateAsync(deleteTarget.id) }}
      />
    </motion.div>
  )
}
