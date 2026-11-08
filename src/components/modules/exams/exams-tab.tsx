'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarRange, ClipboardList, Eye, FileSignature, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
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
        <StatCard label="Scores recorded" value={totals.scores} icon={FileSignature} tone="info" loading={!data} />
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
            <FieldError error={errs.name?.message} />
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
              <FieldError error={errs.termId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.watch('examTypeId')} onValueChange={v => form.setValue('examTypeId', v, { shouldValidate: true })}>
                <SelectTrigger aria-label="Select exam type" aria-invalid={!!errs.examTypeId}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {examTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.weight}%)</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError error={errs.examTypeId?.message} />
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
              <FieldError error={errs.endDate?.message} />
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
