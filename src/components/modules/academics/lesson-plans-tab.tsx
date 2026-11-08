'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpenCheck, Loader2, MoreHorizontal, NotebookPen, Pencil, Plus, Trash2,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
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
import { PLAN_TYPE_LABEL, TERM_LABEL } from './academic-helpers'

interface ClassSubjectRow {
  id: string
  class: { id: string; name: string; level: number }
  subject: { id: string; name: string; code: string | null }
}
interface TermRow { id: string; name: string; sessionId: string; isCurrent: boolean }
interface PlanRow {
  id: string; type: string; week: number | null; topic: string
  objectives: string | null; content: string | null; resources: string | null
  classSubject: {
    id: string
    class: { id: string; name: string; level: number }
    subject: { id: string; name: string; code: string | null }
  }
}

const planFormSchema = z.object({
  classSubjectId: z.string().min(1, 'Choose class + subject'),
  termId: z.string().min(1, 'Choose the term'),
  type: z.enum(['SYLLABUS', 'LESSON_PLAN']),
  week: z.string().optional(),
  topic: z.string().trim().min(2, 'Topic is required').max(200),
  objectives: z.string().max(4000).optional(),
  content: z.string().max(8000).optional(),
  resources: z.string().max(1000).optional(),
})
type PlanValues = z.infer<typeof planFormSchema>

function PlanDialog({ open, onOpenChange, editing, defaultTermId, classSubjects, terms }: {
  open: boolean; onOpenChange: (o: boolean) => void
  editing: PlanRow | null; defaultTermId: string
  classSubjects: ClassSubjectRow[]; terms: TermRow[]
}) {
  const qc = useQueryClient()
  const form = useForm<PlanValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: { classSubjectId: '', termId: defaultTermId, type: 'LESSON_PLAN', week: '', topic: '', objectives: '', content: '', resources: '' },
  })
  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? {
          classSubjectId: editing.classSubject.id, termId: defaultTermId,
          type: editing.type === 'SYLLABUS' ? 'SYLLABUS' : 'LESSON_PLAN',
          week: editing.week ? String(editing.week) : '',
          topic: editing.topic, objectives: editing.objectives ?? '',
          content: editing.content ?? '', resources: editing.resources ?? '',
        }
      : { classSubjectId: '', termId: defaultTermId, type: 'LESSON_PLAN', week: '', topic: '', objectives: '', content: '', resources: '' })
  }

  const save = useMutation({
    mutationFn: (v: PlanValues) => {
      const payload = {
        type: v.type,
        week: v.week ? Number(v.week) : null,
        topic: v.topic,
        objectives: v.objectives || undefined,
        content: v.content || undefined,
        resources: v.resources || undefined,
      }
      return editing
        ? api(`/academics/lesson-plans/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/academics/lesson-plans', { method: 'POST', body: { ...payload, classSubjectId: v.classSubjectId, termId: v.termId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success(editing ? 'Saved' : 'Plan added')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit plan' : 'New lesson plan'}</DialogTitle>
          <DialogDescription>Weekly topics, objectives and materials per subject — feeds the syllabus tracker.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Class + subject</Label>
              <Controller
                name="classSubjectId" control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {classSubjects.map(cs => (
                        <SelectItem key={cs.id} value={cs.id}>
                          {cs.class.name} — {cs.subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errs.classSubjectId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Controller
                name="termId" control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {terms.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {TERM_LABEL[t.name] ?? t.name}{t.isCurrent ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errs.termId?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Controller
                name="type" control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LESSON_PLAN">Lesson plan</SelectItem>
                      <SelectItem value="SYLLABUS">Syllabus</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-week">Week <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="plan-week" type="number" min={1} max={20} placeholder="e.g. 3" {...form.register('week')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-topic">Topic</Label>
            <Input id="plan-topic" placeholder="Fractions — addition and subtraction" {...form.register('topic')} />
            <FieldError message={errs.topic?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-objectives">Objectives <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="plan-objectives" rows={2} placeholder="By the end of this week students should…" {...form.register('objectives')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-content">Content / notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="plan-content" rows={4} placeholder="Detailed teaching notes…" {...form.register('content')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-resources">Resources <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="plan-resources" placeholder="Textbook ch. 4, fraction cards" {...form.register('resources')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Add plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LessonPlansTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [classFilter, setClassFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null)

  const { data: classSubjectsData } = useQuery({
    queryKey: qk.classSubjects(),
    queryFn: () => api<{ items: ClassSubjectRow[] }>('/academics/class-subjects'),
  })
  const classSubjects = classSubjectsData?.items ?? []

  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: { id: string; name: string; isCurrent: boolean; terms: TermRow[] }[] }>('/academics/sessions'),
  })
  const currentSession = sessionsData?.items.find(s => s.isCurrent) ?? sessionsData?.items[0]
  const terms = currentSession?.terms ?? []
  const currentTerm = terms.find(t => t.isCurrent) ?? terms[0]

  const { data, isLoading } = useQuery({
    queryKey: qk.lessonPlans({ classId: classFilter }),
    queryFn: () => api<{ items: PlanRow[] }>('/academics/lesson-plans', { query: { type: typeFilter === 'ALL' ? undefined : typeFilter } }),
  })
  const plans = useMemo(() => {
    const all = data?.items ?? []
    return classFilter === 'ALL' ? all : all.filter(p => p.classSubject.class.id === classFilter)
  }, [data, classFilter])

  const removePlan = useMutation({
    mutationFn: (id: string) => api(`/academics/lesson-plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Plan deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const filteredClassSubjects = useMemo(() => (
    classFilter === 'ALL' ? classSubjects : classSubjects.filter(cs => cs.class.id === classFilter)
  ), [classSubjects, classFilter])

  const columns = useMemo<ColumnDef<PlanRow, unknown>[]>(() => [
    {
      id: 'classSubject',
      accessorFn: r => `${r.classSubject.class.name} ${r.classSubject.subject.name}`,
      header: 'Class — Subject',
      meta: { label: 'Class — Subject' },
      cell: ({ row }) => (
        <div>
          <p className="font-medium leading-tight">{row.original.classSubject.subject.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.classSubject.class.name}</p>
        </div>
      ),
    },
    {
      accessorKey: 'topic',
      header: 'Topic',
      meta: { label: 'Topic' },
      cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.topic}</span>,
    },
    {
      accessorKey: 'week',
      header: 'Week',
      meta: { label: 'Week' },
      cell: ({ getValue }) => (getValue() ? `W${Number(getValue())}` : '—'),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      meta: { label: 'Type' },
      cell: ({ getValue }) => {
        const t = String(getValue())
        return t === 'SYLLABUS'
          ? <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">Syllabus</Badge>
          : <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Lesson plan</Badge>
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const p = row.original
        if (!canWrite) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for plan ${p.topic}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => { setEditing(p); setDialogOpen(true) }}>
                <Pencil aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(p)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite])

  const ready = classSubjects.length > 0 && terms.length > 0

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <DataTable<PlanRow>
        columns={columns}
        data={plans}
        loading={isLoading}
        rowId={p => p.id}
        searchPlaceholder="Search topics…"
        searchExtractor={p => `${p.topic} ${p.classSubject.subject.name} ${p.classSubject.class.name}`}
        initialPageSize={20}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {[...new Map(classSubjects.map(cs => [cs.class.id, cs.class])).values()]
                  .sort((a, b) => a.level - b.level)
                  .map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="LESSON_PLAN">Lesson plans</SelectItem>
                <SelectItem value="SYLLABUS">Syllabus</SelectItem>
              </SelectContent>
            </Select>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => { setEditing(null); setDialogOpen(true) }}
                disabled={!ready}
                title={ready ? undefined : 'Offer subjects to classes and set a current term first'}
              >
                <Plus aria-hidden /> New plan
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={BookOpenCheck}
            title={ready ? 'No lesson plans yet' : 'Prerequisites missing'}
            description={ready
              ? 'Track weekly topics and objectives per subject — start with the current term.'
              : 'Assign subjects to classes and set a session with terms first.'}
            action={canWrite && ready ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> New plan</Button>
            ) : undefined}
          />
        }
      />

      <PlanDialog
        open={dialogOpen} onOpenChange={setDialogOpen} editing={editing}
        defaultTermId={currentTerm?.id ?? ''}
        classSubjects={filteredClassSubjects} terms={terms}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title="Delete this plan?"
        description={`"${deleteTarget?.topic ?? ''}" will be permanently removed.`}
        confirmLabel="Delete plan" destructive
        onConfirm={async () => { if (deleteTarget) await removePlan.mutateAsync(deleteTarget.id) }}
      />
    </motion.div>
  )
}
