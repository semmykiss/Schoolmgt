'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft, BadgeCheck, DoorOpen, Download, FileUp, GraduationCap, IdCard,
  Loader2, MoreHorizontal, Plus, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { downloadCsv, parseCsv } from '@/lib/csv'
import { formatNaira } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'
import { fmtDate } from '@/components/modules/academics/academic-helpers'

// ── types ───────────────────────────────────────────────────────────────────
interface StudentListRow {
  id: string; admissionNumber: string; firstName: string; lastName: string; otherName: string | null
  gender: string; status: string; dateOfBirth: string | null
  class: { id: string; name: string; level: number } | null
  section: { id: string; name: string } | null
  _count: { guardians: number }
}
interface Guardian {
  id: string; firstName: string; lastName: string; relationship: string
  phone: string; email: string | null; occupation: string | null; isPrimary: boolean
}
interface StudentDetail extends StudentListRow {
  address: string | null; bloodGroup: string | null; medicalNotes: string | null
  admissionDate: string; exitDate: string | null; exitReason: string | null
  guardians: Guardian[]
  siblings: { id: string; fullName: string; admissionNumber: string; className: string | null; guardians: string[] }[]
  summary: { absences: number; invoices: number; billedKobo: number; paidKobo: number }
}

const STATUS_META: Record<string, { label: string; chip: string }> = {
  ACTIVE: { label: 'Active', chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' },
  GRADUATED: { label: 'Graduated', chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/40' },
  TRANSFERRED: { label: 'Transferred', chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/40' },
  SUSPENDED: { label: 'Suspended', chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40' },
  LEFT: { label: 'Left', chip: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/40' },
}

const createSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  otherName: z.string().max(60).optional(),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.string().optional(),
  classId: z.string(),
  sectionId: z.string(),
  admissionDate: z.string().min(1, 'Admission date is required'),
})
type CreateValues = z.infer<typeof createSchema>

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  otherName: z.string().max(60).optional(),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.string().optional(),
  classId: z.string(),
  sectionId: z.string(),
  address: z.string().max(300).optional(),
})
type ProfileValues = z.infer<typeof profileSchema>

const guardianSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  relationship: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'SPONSOR']),
  phone: z.string().trim().regex(/^(\+?234|0)[\d\s-]{7,14}$/, 'e.g. 0803 000 0000'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  occupation: z.string().max(80).optional(),
})
type GuardianValues = z.infer<typeof guardianSchema>

// ── create dialog ───────────────────────────────────────────────────────────
function CreateStudentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string; sections: { id: string; name: string }[] }[] }>('/academics/classes'),
    enabled: open,
  })
  const classes = classesData?.items ?? []
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { firstName: '', lastName: '', otherName: '', gender: 'MALE', dateOfBirth: '', classId: 'NONE', sectionId: 'NONE', admissionDate: new Date().toISOString().slice(0, 10) },
  })
  const classId = form.watch('classId')
  const sections = classes.find(c => c.id === classId)?.sections ?? []
  const errs = form.formState.errors

  const create = useMutation({
    mutationFn: (v: CreateValues) => api<{ admissionNumber: string }>('/students', {
      method: 'POST',
      body: {
        ...v,
        otherName: v.otherName || undefined,
        dateOfBirth: v.dateOfBirth || null,
        classId: v.classId === 'NONE' ? null : v.classId,
        sectionId: v.sectionId === 'NONE' ? null : v.sectionId,
      },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Student enrolled — ${r.admissionNumber}`)
      onOpenChange(false)
      form.reset()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not enrol student'),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!create.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrol student</DialogTitle>
          <DialogDescription>The admission number (e.g. CDG/2026/0049) is generated automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => create.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-first">First name</Label>
              <Input id="st-first" {...form.register('firstName')} />
              <FieldError message={errs.firstName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-last">Last name</Label>
              <Input id="st-last" {...form.register('lastName')} />
              <FieldError message={errs.lastName?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="st-other">Other name</Label>
              <Input id="st-other" {...form.register('otherName')} />
            </div>
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
              <Label htmlFor="st-dob">Date of birth</Label>
              <Input id="st-dob" type="date" {...form.register('dateOfBirth')} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Controller name="classId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={val => { field.onChange(val); form.setValue('sectionId', 'NONE') }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unassigned</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
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
              <Label htmlFor="st-adm">Admission date</Label>
              <Input id="st-adm" type="date" {...form.register('admissionDate')} />
              <FieldError message={errs.admissionDate?.message} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Enrol student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── import dialog ───────────────────────────────────────────────────────────
interface ImportReport { row: number; status: string; admissionNumber?: string; message?: string }

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [report, setReport] = useState<ImportReport[] | null>(null)

  const onFile = async (file: File) => {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) { toast.error('The CSV needs a header row and at least one student'); return }
    const headers = rows[0].map(h => h.trim().toLowerCase())
    const wanted = ['first name', 'last name', 'gender', 'class', 'date of birth', 'guardian name', 'guardian phone']
    const missing = wanted.filter(w => !headers.includes(w))
    if (missing.length) { toast.error(`Missing column(s): ${missing.join(', ')}`); return }
    setFileName(file.name)
    setPreview(rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))))
    setReport(null)
  }

  const doImport = useMutation({
    mutationFn: () => api<{ results: ImportReport[]; created: number; failed: number }>('/students/import', {
      method: 'POST',
      body: {
        rows: preview.map(r => ({
          firstName: r['first name'], lastName: r['last name'],
          gender: (r['gender'] || 'MALE').toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE',
          className: r['class'] || '',
          dateOfBirth: r['date of birth'] || '',
          guardianName: r['guardian name'] || '',
          guardianPhone: r['guardian phone'] || '',
        })),
      },
    }),
    onSuccess: r => {
      setReport(r.results)
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${r.created} student(s) imported${r.failed ? `, ${r.failed} failed` : ''}`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Import failed'),
  })

  const reset = () => { setPreview([]); setFileName(''); setReport(null) }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onOpenChange(false) } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import students from CSV</DialogTitle>
          <DialogDescription>
            Columns: <code className="text-xs">First Name, Last Name, Gender, Class, Date of Birth, Guardian Name, Guardian Phone</code>
          </DialogDescription>
        </DialogHeader>
        {report ? (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-3 [scrollbar-width:thin]">
            {report.map(r => (
              <p key={r.row} className="text-sm">
                <span className="text-muted-foreground">Row {r.row}:</span>{' '}
                {r.status === 'CREATED'
                  ? <span className="text-emerald-600 dark:text-emerald-400">created {r.admissionNumber}</span>
                  : <span className="text-destructive">failed — {r.message}</span>}
              </p>
            ))}
          </div>
        ) : preview.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40">
            <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{fileName || 'Choose a .csv file'}</span>
            <span className="text-xs text-muted-foreground">Exported from Excel, Google Sheets or another school software</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-sm"><span className="font-medium">{preview.length} row(s)</span> ready to import.</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border [scrollbar-width:thin]">
              <table className="w-full text-xs">
                <thead className="bg-muted/60"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Gender</th><th className="p-2 text-left">Class</th></tr></thead>
                <tbody>
                  {preview.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t"><td className="p-2">{r['first name']} {r['last name']}</td><td className="p-2">{r['gender']}</td><td className="p-2">{r['class'] || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          {report ? (
            <Button onClick={() => { reset(); onOpenChange(false) }}>Done</Button>
          ) : preview.length > 0 ? (
            <>
              <Button variant="ghost" onClick={reset}>Pick another file</Button>
              <Button onClick={() => doImport.mutate()} disabled={doImport.isPending}>
                {doImport.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Import {preview.length} students
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── student detail panel ────────────────────────────────────────────────────
function GuardianDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'NEW' | 'EXISTING'>('NEW')
  const [search, setSearch] = useState('')
  const { data: existing } = useQuery({
    queryKey: ['guardians', 'search', search],
    queryFn: () => api<{ items: Guardian[] }>('/guardians', { query: { search: search || undefined } }),
    enabled: mode === 'EXISTING',
  })
  const form = useForm<GuardianValues>({
    resolver: zodResolver(guardianSchema),
    defaultValues: { firstName: '', lastName: '', relationship: 'FATHER', phone: '', email: '', occupation: '' },
  })
  const errs = form.formState.errors

  const link = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/students/${studentId}/guardians`, { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      toast.success('Guardian linked')
      onClose()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add guardian</DialogTitle>
          <DialogDescription>Linking a guardian that already has children connects the siblings automatically.</DialogDescription>
        </DialogHeader>
        <div className="mb-2 grid grid-cols-2 gap-2" role="tablist" aria-label="Guardian mode">
          {(['NEW', 'EXISTING'] as const).map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}>
              {m === 'NEW' ? 'New guardian' : 'Existing guardian'}
            </button>
          ))}
        </div>
        {mode === 'NEW' ? (
          <form onSubmit={form.handleSubmit(v => link.mutate({ new: { ...v, email: v.email || undefined, occupation: v.occupation || undefined }, relation: v.relationship }))} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-first">First name</Label>
                <Input id="g-first" {...form.register('firstName')} />
                <FieldError message={errs.firstName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-last">Last name</Label>
                <Input id="g-last" {...form.register('lastName')} />
                <FieldError message={errs.lastName?.message} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Controller name="relationship" control={form.control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['FATHER', 'MOTHER', 'GUARDIAN', 'SPONSOR'].map(r => <SelectItem key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-phone">Phone</Label>
                <Input id="g-phone" type="tel" placeholder="0803 000 0000" {...form.register('phone')} />
                <FieldError message={errs.phone?.message} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-email">Email</Label>
                <Input id="g-email" type="email" {...form.register('email')} />
                <FieldError message={errs.email?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-occ">Occupation</Label>
                <Input id="g-occ" {...form.register('occupation')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={link.isPending}>
                {link.isPending && <Loader2 className="animate-spin" aria-hidden />}
                <UserPlus aria-hidden /> Link guardian
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Search guardians by name or phone…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search guardians" />
            <div className="max-h-60 space-y-1 overflow-y-auto [scrollbar-width:thin]">
              {(existing?.items ?? []).length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No guardians found</p>}
              {(existing?.items ?? []).map(g => (
                <button key={g.id} type="button"
                  onClick={() => link.mutate({ guardianId: g.id, relation: g.relationship })}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60">
                  <span>
                    <span className="font-medium">{g.firstName} {g.lastName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{g.relationship} · {g.phone}</span>
                  </span>
                  <Badge variant="outline">Link</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExitDialog({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState('TRANSFERRED')
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('TRANSFERRED_OUT')
  const [notes, setNotes] = useState('')

  const exit = useMutation({
    mutationFn: () => api(`/students/${student.id}/exit`, {
      method: 'POST',
      body: { status, exitDate, exitReason: reason, notes: notes || undefined },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${student.firstName} marked ${status.toLowerCase()}${(r as { unpaidInvoices?: number }).unpaidInvoices ? ` — ${(r as { unpaidInvoices?: number }).unpaidInvoices} unpaid invoice(s) remain` : ''}`)
      onClose()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exit school — {student.firstName} {student.lastName}</DialogTitle>
          <DialogDescription>The student leaves the active roll; their records are preserved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Exit type</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFERRED">Transferred out</SelectItem>
                  <SelectItem value="GRADUATED">Graduated</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="LEFT">Left school</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-date">Effective date</Label>
              <Input id="ex-date" type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['TRANSFERRED_OUT', 'GRADUATED', 'WITHDRAWN', 'MEDICAL', 'FINANCIAL', 'OTHER'].map(r => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="ex-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="New school name, destination…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={() => exit.mutate()} disabled={exit.isPending}>
              {exit.isPending && <Loader2 className="animate-spin" aria-hidden />}
              <DoorOpen aria-hidden /> Record exit
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StudentDetailPanel({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [guardianDialog, setGuardianDialog] = useState(false)
  const [unlinkTarget, setUnlinkTarget] = useState<Guardian | null>(null)

  const { data: student, isLoading } = useQuery({
    queryKey: qk.student(studentId),
    queryFn: () => api<StudentDetail>(`/students/${studentId}`),
  })
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string; sections: { id: string; name: string }[] }[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: student ? {
      firstName: student.firstName, lastName: student.lastName, otherName: student.otherName ?? '',
      gender: student.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
      dateOfBirth: student.dateOfBirth ?? '', classId: student.class?.id ?? 'NONE',
      sectionId: student.section?.id ?? 'NONE', address: student.address ?? '',
    } : undefined,
  })
  const watchClassId = profileForm.watch('classId')
  const sections = classes.find(c => c.id === watchClassId)?.sections ?? []

  const saveProfile = useMutation({
    mutationFn: (v: ProfileValues) => api(`/students/${studentId}`, {
      method: 'PATCH',
      body: {
        ...v,
        otherName: v.otherName || undefined,
        dateOfBirth: v.dateOfBirth || null,
        address: v.address || undefined,
        classId: v.classId === 'NONE' ? null : v.classId,
        sectionId: v.sectionId === 'NONE' ? null : v.sectionId,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      toast.success('Profile updated')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const saveMedical = useMutation({
    mutationFn: (v: { bloodGroup: string; medicalNotes: string }) => api(`/students/${studentId}`, {
      method: 'PATCH', body: { bloodGroup: v.bloodGroup || undefined, medicalNotes: v.medicalNotes || undefined },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      toast.success('Medical notes updated')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const unlink = useMutation({
    mutationFn: (guardianId: string) => api(`/students/${studentId}/guardians?guardianId=${guardianId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      toast.success('Guardian unlinked')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })

  if (isLoading || !student) {
    return <div className="space-y-3 py-10">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
  }

  const fullName = [student.firstName, student.lastName].join(' ')
  const dues = student.summary.billedKobo - student.summary.paidKobo

  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden /> All students</Button>
        <Separator orientation="vertical" className="h-6" />
        <div>
          <h2 className="text-lg font-semibold leading-tight">{fullName}</h2>
          <p className="font-mono text-xs text-muted-foreground">{student.admissionNumber} · {student.class?.name ?? 'No class'}{student.section ? ` ${student.section.name}` : ''}</p>
        </div>
        <Badge variant="outline" className={`ml-auto ${STATUS_META[student.status]?.chip ?? ''}`}>{STATUS_META[student.status]?.label ?? student.status}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Attendance absences</p><p className="mt-1 text-xl font-semibold">{student.summary.absences}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Invoices</p><p className="mt-1 text-xl font-semibold">{student.summary.invoices}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total billed</p><p className="mt-1 text-xl font-semibold">{formatNaira(student.summary.billedKobo)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className={`mt-1 text-xl font-semibold ${dues > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatNaira(dues)}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList aria-label="Student details">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="guardians">Guardians &amp; Siblings</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
          <TabsTrigger value="idcard">ID Card</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Bio & class</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(v => saveProfile.mutate(v))} noValidate className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-first">First name</Label>
                    <Input id="p-first" {...profileForm.register('firstName')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-last">Last name</Label>
                    <Input id="p-last" {...profileForm.register('lastName')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-other">Other name</Label>
                    <Input id="p-other" {...profileForm.register('otherName')} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Controller name="gender" control={profileForm.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="MALE">Male</SelectItem><SelectItem value="FEMALE">Female</SelectItem></SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-dob">Date of birth</Label>
                    <Input id="p-dob" type="date" {...profileForm.register('dateOfBirth')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admitted</Label>
                    <Input value={fmtDate(student.admissionDate)} disabled readOnly aria-label="Admission date" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Class</Label>
                    <Controller name="classId" control={profileForm.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={v => { field.onChange(v); profileForm.setValue('sectionId', 'NONE') }}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Unassigned</SelectItem>
                          {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Section</Label>
                    <Controller name="sectionId" control={profileForm.control} render={({ field }) => (
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
                    <Label htmlFor="p-addr">Home address</Label>
                    <Input id="p-addr" {...profileForm.register('address')} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={saveProfile.isPending || !useSession.getState().can('students.write')}>
                    {saveProfile.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    Save profile
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guardians" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Guardians</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setGuardianDialog(true)}><Plus aria-hidden /> Add guardian</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {student.guardians.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No guardian linked yet.</p>}
              {student.guardians.map(g => (
                <div key={g.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{g.firstName} {g.lastName} {g.isPrimary && <Badge variant="outline" className="ml-1 border-primary/40 bg-primary/10 text-primary">Primary</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{g.relationship} · {g.phone}{g.email ? ` · ${g.email}` : ''}{g.occupation ? ` · ${g.occupation}` : ''}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Unlink ${g.firstName}`} onClick={() => setUnlinkTarget(g)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Siblings <span className="text-sm font-normal text-muted-foreground">(via shared guardians)</span></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {student.siblings.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No siblings found in this school.</p>}
              {student.siblings.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.fullName}</p>
                    <p className="text-xs text-muted-foreground">{s.admissionNumber} · {s.className ?? 'No class'} · via {s.guardians.join(', ')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={onBack}>Profile</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medical" className="mt-4">
          <MedicalTab student={student} onSave={v => saveMedical.mutate(v)} saving={saveMedical.isPending} />
        </TabsContent>

        <TabsContent value="idcard" className="mt-4">
          <IdCardTab student={student} />
        </TabsContent>
      </Tabs>

      {guardianDialog && <GuardianDialog studentId={student.id} onClose={() => setGuardianDialog(false)} />}
      <ConfirmDialog
        open={unlinkTarget !== null}
        onOpenChange={o => { if (!o) setUnlinkTarget(null) }}
        title={`Unlink ${unlinkTarget?.firstName} ${unlinkTarget?.lastName}?`}
        description="The guardian keeps their profile; they just stop appearing on this student."
        confirmLabel="Unlink guardian" destructive
        onConfirm={async () => { if (unlinkTarget) await unlink.mutateAsync(unlinkTarget.id) }}
      />
    </motion.div>
  )
}

function MedicalTab({ student, onSave, saving }: { student: StudentDetail; onSave: (v: { bloodGroup: string; medicalNotes: string }) => void; saving: boolean }) {
  const [bloodGroup, setBloodGroup] = useState(student.bloodGroup ?? '')
  const [notes, setNotes] = useState(student.medicalNotes ?? '')
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Medical information</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="m-blood">Blood group</Label>
            <Input id="m-blood" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} placeholder="O+" maxLength={5} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-notes">Allergies / medical notes</Label>
            <Textarea id="m-notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Asthma, allergies, medication schedule…" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => onSave({ bloodGroup, medicalNotes: notes })} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Save medical info
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IdCardTab({ student }: { student: StudentDetail }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><IdCard className="h-4 w-4" aria-hidden /> Student ID card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div id="student-id-card" className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 border-primary/60 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
          <div className="bg-primary px-4 py-3 text-primary-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide">Crescent Dawn Group of Schools</p>
            <p className="text-[10px] opacity-90">Ikeja, Lagos • schooldesk.ng</p>
          </div>
          <div className="space-y-2 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                <GraduationCap className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold leading-tight">{student.firstName} {student.lastName}</p>
                <p className="font-mono text-xs text-muted-foreground">{student.admissionNumber}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-xs">
              <dt className="text-muted-foreground">Class</dt><dd className="font-medium">{student.class?.name ?? '—'}{student.section ? ` ${student.section.name}` : ''}</dd>
              <dt className="text-muted-foreground">Gender</dt><dd className="font-medium">{student.gender}</dd>
              <dt className="text-muted-foreground">Date of birth</dt><dd className="font-medium">{student.dateOfBirth ? fmtDate(student.dateOfBirth) : '—'}</dd>
              <dt className="text-muted-foreground">Blood group</dt><dd className="font-medium">{student.bloodGroup ?? '—'}</dd>
              <dt className="text-muted-foreground">Valid until</dt><dd className="font-medium">End of session</dd>
            </dl>
            <p className="border-t pt-2 text-[10px] text-muted-foreground">If found, please return to the school address above.</p>
          </div>
        </div>
        <div className="text-center">
          <Button variant="outline" onClick={() => window.print()}><BadgeCheck aria-hidden /> Print card</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── main view ───────────────────────────────────────────────────────────────
export function StudentsView() {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('students.write'))
  const canImport = useSession(s => s.can('students.import'))
  const canExport = useSession(s => s.can('students.export'))
  const canExit = useSession(s => s.can('students.exit'))
  const [classFilter, setClassFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ACTIVE')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StudentListRow | null>(null)
  const [exitTarget, setExitTarget] = useState<StudentDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string; sections: { id: string; name: string }[] }[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []

  const filters = { classId: classFilter, status: statusFilter }
  const { data, isLoading } = useQuery({
    queryKey: qk.students(filters),
    queryFn: () => api<{ items: StudentListRow[]; counts: Record<string, number> }>('/students', {
      query: { classId: classFilter === 'ALL' ? undefined : classFilter, status: statusFilter === 'ALL' ? undefined : statusFilter },
    }),
  })
  const students = data?.items ?? []
  const counts = data?.counts ?? {}

  const removeStudent = useMutation({
    mutationFn: (id: string) => api(`/students/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Student deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<StudentListRow, unknown>[]>(() => [
    {
      accessorKey: 'lastName',
      header: 'Student',
      meta: { label: 'Student' },
      cell: ({ row }) => (
        <div>
          <p className="font-medium leading-tight">{row.original.lastName} {row.original.firstName}{row.original.otherName ? ` (${row.original.otherName})` : ''}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.admissionNumber}</p>
        </div>
      ),
    },
    {
      id: 'class',
      accessorFn: r => r.class?.name ?? '',
      header: 'Class',
      meta: { label: 'Class' },
      cell: ({ row }) => row.original.class
        ? <Badge variant="outline">{row.original.class.name}{row.original.section ? ` ${row.original.section.name}` : ''}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    { accessorKey: 'gender', header: 'Gender', meta: { label: 'Gender' }, cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{String(getValue())}</span> },
    {
      accessorKey: 'dateOfBirth',
      header: 'Born',
      meta: { label: 'Born' },
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.dateOfBirth ? fmtDate(row.original.dateOfBirth) : '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { label: 'Status' },
      cell: ({ row }) => {
        const meta = STATUS_META[row.original.status]
        return meta ? <Badge variant="outline" className={meta.chip}>{meta.label}</Badge> : row.original.status
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const s = row.original
        if (!canWrite && !canExit) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${s.firstName}`} onClick={e => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" onClick={e => e.stopPropagation()}>
              {canExit && s.status === 'ACTIVE' && (
                <DropdownMenuItem onSelect={async () => {
                  const detail = await api<StudentDetail>(`/students/${s.id}`)
                  setExitTarget(detail)
                }}>
                  <DoorOpen aria-hidden /> Exit school…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(s)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite, canExit])

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (classFilter !== 'ALL') params.set('classId', classFilter)
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    const qs = params.toString()
    return `/api/v1/students/export${qs ? `?${qs}` : ''}`
  }, [classFilter, statusFilter])

  // detail panel mode
  if (selectedId) {
    return (
      <div className="space-y-4">
        <StudentDetailPanel studentId={selectedId} onBack={() => setSelectedId(null)} />
        {exitTarget && <ExitDialog student={exitTarget} onClose={() => setExitTarget(null)} />}
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'LEFT'].map(st => {
          const active = statusFilter === st
          const meta = STATUS_META[st]
          return (
            <button key={st} type="button" onClick={() => setStatusFilter(active ? 'ALL' : st)} aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/60'}`}>
              {meta.label} · {counts[st] ?? 0}
            </button>
          )
        })}
      </div>

      <DataTable<StudentListRow>
        columns={columns}
        data={students}
        loading={isLoading}
        rowId={s => s.id}
        onRowClick={s => setSelectedId(s.id)}
        searchPlaceholder="Search name or admission number…"
        searchExtractor={s => `${s.firstName} ${s.lastName} ${s.otherName ?? ''} ${s.admissionNumber}`}
        initialPageSize={15}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {canExport && (
              <Button size="sm" variant="outline" asChild>
                <a href={exportUrl} download><Download aria-hidden /> Export CSV</a>
              </Button>
            )}
            {canWrite && (
              <>
                {canImport && <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><FileUp aria-hidden /> Import CSV</Button>}
                <Button size="sm" onClick={() => setCreateOpen(true)}><Plus aria-hidden /> Enrol student</Button>
              </>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={Users}
            title="No students here"
            description={statusFilter !== 'ALL' || classFilter !== 'ALL' ? 'Try clearing the filters.' : 'Enrol your first student or import a CSV from your previous system.'}
            action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus aria-hidden /> Enrol student</Button> : undefined}
          />
        }
      />

      <CreateStudentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete ${deleteTarget?.firstName} ${deleteTarget?.lastName}?`}
        description="Students with invoices or exam results cannot be deleted — record an exit instead."
        confirmLabel="Delete student" destructive
        onConfirm={async () => { if (deleteTarget) await removeStudent.mutateAsync(deleteTarget.id) }}
      />
    </motion.div>
  )
}
