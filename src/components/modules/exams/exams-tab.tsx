'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarRange, ClipboardList, Clock, Eye, FileSignature, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { fmtDate } from '@/components/modules/academics/academic-helpers'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { StatCard } from '@/components/shared/stat-card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { FieldError } from '@/components/shared/field-error'
import { cn } from '@/lib/utils'

interface ExamRow {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  publishResults: boolean
  publishClassScores: boolean
  term: { id: string; name: string; sessionId: string; session: { name: string; isCurrent: boolean } }
  examType: { id: string; name: string; weight: number }
  _count: { schedules: number; results: number; reportCards: number }
}
interface SessionRow { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[] }
interface ExamTypeRow { id: string; name: string; weight: number; _count: { exams: number } }

const formSchema = z.object({
  name: z.string().min(3, 'Give the exam a name (min 3 characters)').max(140),
  termId: z.string().min(1, 'Select the term'),
  examTypeId: z.string().min(1, 'Select the exam type'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
})
type FormValues = z.infer<typeof formSchema>

export function ExamsTab({ canWrite, onGoMarks }: { canWrite: boolean; onGoMarks: () => void }) {
  const qc = useQueryClient()
  const canMark = useSession(s => s.can('exams.marks'))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExamRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExamRow | null>(null)
  const [papersTarget, setPapersTarget] = useState<ExamRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.exams(),
    queryFn: () => api<{ items: ExamRow[]; total: number; published: number }>('/exams', { query: { pageSize: 100 } }),
  })
  const exams = useMemo(() => data?.items ?? [], [data])

  const { data: typesData } = useQuery({
    queryKey: qk.examTypes(),
    queryFn: () => api<{ items: ExamTypeRow[] }>('/exams/exam-types'),
  })
  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: SessionRow[] }>('/academics/sessions'),
  })
  const terms = useMemo(
    () => (sessionsData?.items ?? []).flatMap(s => s.terms.map(t => ({ ...t, sessionName: s.name }))),
    [sessionsData],
  )

  const totals = useMemo(() => ({
    papers: exams.reduce((n, e) => n + e._count.schedules, 0),
    scores: exams.reduce((n, e) => n + e._count.results, 0),
  }), [exams])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['exams'] })

  const publish = useMutation({
    mutationFn: ({ id, publishResults, publishClassScores }: { id: string; publishResults?: boolean; publishClassScores?: boolean }) =>
      api<ExamRow>(`/exams/${id}/publish`, { method: 'POST', body: { publishResults, publishClassScores } }),
    onSuccess: updated => {
      invalidate()
      toast.success(updated.publishResults
        ? `Results published — ${updated.name} is now live on the portals`
        : 'Exam visibility updated')
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Publish failed'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success('Exam deleted') },
    onError: e => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const columns: ColumnDef<ExamRow>[] = [
    {
      accessorKey: 'name',
      header: 'Exam',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.examType.name} · {row.original.examType.weight}% weight
          </p>
        </div>
      ),
    },
    {
      id: 'term',
      header: 'Term',
      cell: ({ row }) => (
        <div className="text-sm">
          <p>{TERM_LABEL[row.original.term.name] ?? row.original.term.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.term.session.name}</p>
        </div>
      ),
    },
    {
      id: 'period',
      header: 'Period',
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          {row.original.startDate ? `${fmtDate(row.original.startDate)}${row.original.endDate ? ` – ${fmtDate(row.original.endDate)}` : ''}` : 'Not set'}
        </span>
      ),
    },
    {
      id: 'papers',
      header: 'Papers',
      cell: ({ row }) => <Badge variant="outline" className="tabular-nums">{row.original._count.schedules}</Badge>,
    },
    {
      id: 'scores',
      header: 'Scores',
      cell: ({ row }) => <Badge variant="outline" className="tabular-nums">{row.original._count.results}</Badge>,
    },
    {
      id: 'publish',
      header: 'Published',
      cell: ({ row }) => canWrite ? (
        <div className="flex flex-col gap-1.5" aria-label={`Publish controls for ${row.original.name}`}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={row.original.publishResults}
              onCheckedChange={v => publish.mutate({ id: row.original.id, publishResults: v })}
              disabled={publish.isPending}
              aria-label={`Publish results for ${row.original.name}`}
            />
            Results
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={row.original.publishClassScores}
              onCheckedChange={v => publish.mutate({ id: row.original.id, publishClassScores: v })}
              disabled={publish.isPending}
              aria-label={`Publish class scores for ${row.original.name}`}
            />
            Scores
          </label>
        </div>
      ) : row.original.publishResults ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Published</Badge>
      ) : (
        <Badge variant="outline">Draft</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost" size="icon"
            aria-label={`Manage papers for ${row.original.name}`}
            title={row.original._count.schedules === 0 ? 'No papers yet — build the exam timetable' : 'Exam timetable (papers)'}
            onClick={() => setPapersTarget(row.original)}
          >
            <CalendarRange
              className={cn('h-4 w-4', row.original._count.schedules === 0 ? 'text-amber-500' : 'text-muted-foreground')}
              aria-hidden
            />
          </Button>
          {canMark && (
            <Button variant="ghost" size="icon" aria-label={`Enter marks for ${row.original.name}`} onClick={onGoMarks} title="Go to Marks Entry">
              <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          )}
          {canWrite && (
            <>
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditTarget(row.original); setDialogOpen(true) }}>
                <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Button>
              <Button
                variant="ghost" size="icon"
                aria-label={`Delete ${row.original.name}`}
                onClick={() => setDeleteTarget(row.original)}
                disabled={row.original.publishResults}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Exams" value={data?.total ?? 0} icon={ClipboardList} loading={!data} />
        <StatCard label="Published" value={data?.published ?? 0} icon={Eye} tone="success" loading={!data} />
        <StatCard label="Papers scheduled" value={totals.papers} icon={CalendarRange} loading={!data} />
        <StatCard label="Scores recorded" value={totals.scores} icon={FileSignature} tone="primary" loading={!data} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">All exams</h2>
            <p className="text-xs text-muted-foreground">Create exams per term, publish results to the portals</p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
              <Plus aria-hidden /> New exam
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden /></div>
        ) : exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No exams yet"
            description={canWrite ? 'Create your first exam — e.g. "First Term Mid-Term Test".' : 'No exams have been created yet.'}
          />
        ) : (
          <DataTable
            columns={columns}
            data={exams}
            rowId={e => e.id}
            searchPlaceholder="Search exams…"
            searchExtractor={e => `${e.name} ${e.examType.name} ${e.term.name} ${e.term.session.name}`}
          />
        )}
      </div>

      <ExamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        examTypes={typesData?.items ?? []}
        terms={terms}
        onDone={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Its exam timetable, scores and report cards are removed with it. This cannot be undone."
        confirmLabel="Delete exam"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />

      <PapersDialog
        exam={papersTarget}
        open={!!papersTarget}
        onOpenChange={o => { if (!o) setPapersTarget(null) }}
        canWrite={canWrite}
        onChanged={invalidate}
      />
    </div>
  )
}

// ── Create / edit dialog ────────────────────────────────────────────────────
function ExamDialog({ open, onOpenChange, editTarget, examTypes, terms, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editTarget: ExamRow | null
  examTypes: ExamTypeRow[]
  terms: (SessionRow['terms'][number] & { sessionName: string })[]
  onDone: () => void
}) {
  const qc = useQueryClient()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', termId: '', examTypeId: '', startDate: '', endDate: '' },
  })

  // Re-seed on open
  const [seededKey, setSeededKey] = useState('')
  const seedKey = `${open}:${editTarget?.id ?? 'new'}`
  if (open && seededKey !== seedKey) {
    setSeededKey(seedKey)
    form.reset(editTarget ? {
      name: editTarget.name,
      termId: editTarget.term.id,
      examTypeId: editTarget.examType.id,
      startDate: editTarget.startDate ?? '',
      endDate: editTarget.endDate ?? '',
    } : { name: '', termId: '', examTypeId: '', startDate: '', endDate: '' })
  }

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name: v.name,
        termId: v.termId,
        examTypeId: v.examTypeId,
        startDate: v.startDate || '',
        endDate: v.endDate || '',
      }
      return editTarget
        ? api(`/exams/${editTarget.id}`, { method: 'PATCH', body })
        : api('/exams', { method: 'POST', body })
    },
    onSuccess: exam => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      onDone()
      onOpenChange(false)
      toast.success(editTarget ? 'Exam updated' : `Exam created — ${(exam as ExamRow).name}`)
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) form.reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit exam' : 'New exam'}</DialogTitle>
          <DialogDescription>
            {editTarget ? 'Update the exam details.' : 'One exam of each type per term — e.g. a Mid-Term Test and a Final Exam.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="exam-name">Name</Label>
            <Input id="exam-name" placeholder="First Term Examination — 2024/2025" {...form.register('name')} aria-invalid={!!errs.name} />
            <FieldError message={errs.name?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={form.watch('termId')} onValueChange={v => form.setValue('termId', v, { shouldValidate: true })}>
                <SelectTrigger aria-label="Select term" aria-invalid={!!errs.termId}><SelectValue placeholder="Select term" /></SelectTrigger>
                <SelectContent>
                  {terms.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {TERM_LABEL[t.name] ?? t.name} — {t.sessionName}{t.isCurrent ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errs.termId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.watch('examTypeId')} onValueChange={v => form.setValue('examTypeId', v, { shouldValidate: true })}>
                <SelectTrigger aria-label="Select exam type" aria-invalid={!!errs.examTypeId}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {examTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.weight}%)</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={errs.examTypeId?.message} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-start">Starts (optional)</Label>
              <Input id="exam-start" type="date" {...form.register('startDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-end">Ends (optional)</Label>
              <Input id="exam-end" type="date" {...form.register('endDate')} />
              <FieldError message={errs.endDate?.message} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editTarget ? 'Save changes' : 'Create exam'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Exam timetable (papers) dialog ──────────────────────────────────────────
interface ScheduleRow {
  id: string
  date: string
  startTime: string
  endTime: string
  maxMarks: number
  passMarks: number
  classSubject: {
    id: string
    subject: { name: string; code: string | null }
    class: { id: string; name: string }
    teacher: { id: string; firstName: string; lastName: string } | null
  }
}
interface ClassOption { id: string; name: string; level: number }
interface ClassSubjectOption {
  id: string
  subject: { name: string; code: string | null }
  teacher: { fullName: string } | null
}

function PapersDialog({ exam, open, onOpenChange, canWrite, onChanged }: {
  exam: ExamRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  canWrite: boolean
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const examId = exam?.id ?? ''
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null)
  const [classId, setClassId] = useState('NONE')
  const [classSubjectId, setClassSubjectId] = useState('NONE')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [maxMarks, setMaxMarks] = useState('100')
  const [passMarks, setPassMarks] = useState('40')
  const [formError, setFormError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: qk.examSchedules(open && examId ? examId : undefined),
    queryFn: () => api<{ items: ScheduleRow[] }>('/exams/schedules', { query: { examId } }),
    enabled: open && !!examId,
  })
  const schedules = data?.items ?? []

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassOption[] }>('/academics/classes'),
    enabled: open,
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])

  const { data: csData, isLoading: csLoading } = useQuery({
    queryKey: qk.classSubjects(classId === 'NONE' ? undefined : classId),
    queryFn: () => api<{ items: ClassSubjectOption[] }>('/academics/class-subjects', { query: { classId } }),
    enabled: open && formOpen && classId !== 'NONE',
  })
  const classSubjects = csData?.items ?? []

  const closeForm = () => { setFormOpen(false); setEditTarget(null); setFormError('') }

  const openAdd = () => {
    setEditTarget(null)
    setClassId('NONE')
    setClassSubjectId('NONE')
    setDate(exam?.startDate ?? '')
    setStartTime('09:00')
    setEndTime('11:00')
    setMaxMarks('100')
    setPassMarks('40')
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (s: ScheduleRow) => {
    setEditTarget(s)
    setClassId(s.classSubject.class.id)
    setClassSubjectId(s.classSubject.id)
    setDate(s.date)
    setStartTime(s.startTime)
    setEndTime(s.endTime)
    setMaxMarks(String(s.maxMarks))
    setPassMarks(String(s.passMarks))
    setFormError('')
    setFormOpen(true)
  }

  const validate = (): string => {
    if (classId === 'NONE' || classSubjectId === 'NONE') return 'Select the class and subject for this paper'
    if (!date) return 'Pick the exam date'
    if (!startTime || !endTime) return 'Set both the start and end time'
    if (startTime >= endTime) return 'End time must be after the start time'
    const max = Number(maxMarks)
    const pass = Number(passMarks)
    if (!Number.isFinite(max) || max < 1 || max > 1000) return 'Max marks must be between 1 and 1000'
    if (!Number.isFinite(pass) || pass < 0 || pass > max) return 'Pass marks must be between 0 and the max marks'
    return ''
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...(editTarget ? {} : { examId }),
        classSubjectId,
        date,
        startTime,
        endTime,
        maxMarks: Number(maxMarks),
        passMarks: Number(passMarks),
      }
      return editTarget
        ? api(`/exams/schedules/${editTarget.id}`, { method: 'PATCH', body })
        : api('/exams/schedules', { method: 'POST', body })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exams'] })
      onChanged()
      closeForm()
      toast.success(editTarget ? 'Paper updated' : 'Paper scheduled')
    },
    onError: e => setFormError(e instanceof Error ? e.message : 'Save failed'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/exams/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exams'] })
      onChanged()
      setDeleteTarget(null)
      toast.success('Paper removed from the timetable')
    },
    onError: e => { setDeleteTarget(null); toast.error(e instanceof Error ? e.message : 'Delete failed') },
  })

  const grouped = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>()
    for (const s of schedules) {
      const list = m.get(s.date) ?? []
      list.push(s)
      m.set(s.date, list)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [schedules])

  const classSubject = classSubjects.find(cs => cs.id === classSubjectId)

  return (
    <>
      <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) closeForm() }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Exam timetable — {exam?.name ?? ''}</DialogTitle>
            <DialogDescription>
              Schedule one paper per class subject with its date, time and marks. Marks entry needs at least one paper.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label="Exam papers">
            {isLoading ? (
              <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /></div>
            ) : grouped.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No papers yet. Add the first paper to unlock marks entry for this exam.
              </p>
            ) : (
              grouped.map(([day, rows]) => (
                <div key={day} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fmtDate(day)}</p>
                  <ul className="space-y-1.5" role="list" aria-label={`Papers on ${day}`}>
                    {rows.map(s => (
                      <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {s.classSubject.class.name} — {s.classSubject.subject.name}
                            {s.classSubject.subject.code ? ` (${s.classSubject.subject.code})` : ''}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" aria-hidden />
                            {s.startTime}–{s.endTime} · Max {s.maxMarks} · Pass {s.passMarks}
                            {s.classSubject.teacher ? ` · ${s.classSubject.teacher.firstName} ${s.classSubject.teacher.lastName}` : ''}
                          </p>
                        </div>
                        {canWrite && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Edit ${s.classSubject.subject.name} paper`} onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Remove ${s.classSubject.subject.name} paper`} onClick={() => setDeleteTarget(s)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          {formOpen ? (
            <form
              className="space-y-3 rounded-xl border bg-muted/30 p-3"
              onSubmit={e => { e.preventDefault(); const err = validate(); if (err) { setFormError(err); return } setFormError(''); save.mutate() }}
              noValidate
            >
              <p className="text-sm font-semibold">{editTarget ? `Edit ${editTarget.classSubject.subject.name} paper` : 'Add a paper'}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={v => { setClassId(v); setClassSubjectId('NONE') }}>
                    <SelectTrigger aria-label="Select class for the paper"><SelectValue placeholder="Pick a class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select value={classSubjectId} onValueChange={setClassSubjectId}>
                    <SelectTrigger aria-label="Select subject for the paper"><SelectValue placeholder={classId === 'NONE' ? 'Pick a class first' : 'Pick a subject'} /></SelectTrigger>
                    <SelectContent>
                      {csLoading ? (
                        <SelectItem value="LOADING" disabled>Loading…</SelectItem>
                      ) : classSubjects.length === 0 ? (
                        <SelectItem value="NONE" disabled>No subjects assigned to this class</SelectItem>
                      ) : (
                        classSubjects.map(cs => (
                          <SelectItem key={cs.id} value={cs.id}>
                            {cs.subject.name}{cs.subject.code ? ` (${cs.subject.code})` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {classSubject?.teacher && <p className="text-xs text-muted-foreground">Teacher: {classSubject.teacher.fullName}</p>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paper-date">Date</Label>
                  <Input id="paper-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paper-start">Starts</Label>
                  <Input id="paper-start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paper-end">Ends</Label>
                  <Input id="paper-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paper-max">Max marks</Label>
                  <Input id="paper-max" type="number" min={1} max={1000} value={maxMarks} onChange={e => setMaxMarks(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paper-pass">Pass marks</Label>
                  <Input id="paper-pass" type="number" min={0} max={1000} value={passMarks} onChange={e => setPassMarks(e.target.value)} />
                </div>
              </div>
              {formError && <FieldError message={formError} />}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeForm}>Cancel</Button>
                <Button type="submit" size="sm" disabled={save.isPending}>
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {editTarget ? 'Save paper' : 'Schedule paper'}
                </Button>
              </div>
            </form>
          ) : (
            canWrite && (
              <Button onClick={openAdd} className="w-full sm:w-auto">
                <Plus aria-hidden /> Add paper
              </Button>
            )
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Remove ${deleteTarget?.classSubject.subject.name ?? ''} paper?`}
        description="Papers with scores already entered cannot be removed — clear those scores first."
        confirmLabel="Remove paper"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </>
  )
}
