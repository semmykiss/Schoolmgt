'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Loader2, NotebookPen, Pencil, Plus, SquarePen, Trash2, Users2,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { cn } from '@/lib/utils'

interface AssignmentRow {
  id: string
  title: string
  description: string | null
  dueDate: string
  class: { id: string; name: string; _count?: { students: number } }
  subject: { id: string; name: string; code: string | null }
  teacher: { id: string; fullName: string } | null
  _count?: { submissions: number }
}
interface ClassRow { id: string; name: string; level: number }
interface ClassSubjectRow {
  id: string
  class: { id: string; name: string }
  subject: { id: string; name: string; code: string | null }
  teacher: { id: string; fullName: string } | null
}
interface EmployeePick { id: string; fullName: string; staffCode: string; position: string }
interface SubmissionRow {
  studentId: string
  fullName: string
  admissionNumber: string
  section: string | null
  submission: {
    id: string
    status: string // SUBMITTED | LATE | GRADED
    score: number | null
    submittedAt: string
    note: string | null
    fileUrl: string | null
  } | null
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Post / edit homework dialog ─────────────────────────────────────────────
function HomeworkDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: AssignmentRow | null
}) {
  const qc = useQueryClient()
  const role = useSession(s => s.user?.role)
  const isTeacher = role === 'TEACHER'

  const [classId, setClassId] = useState(editing?.class.id ?? '')
  const [subjectId, setSubjectId] = useState(editing?.subject.id ?? '')
  const [teacherId, setTeacherId] = useState(editing?.teacher?.id ?? 'NONE')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? todayIso())
  const [error, setError] = useState<string | undefined>()

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
    enabled: open,
  })
  const classes = classesData?.items ?? []

  const { data: csData } = useQuery({
    queryKey: qk.classSubjects(classId || undefined),
    queryFn: () => api<{ items: ClassSubjectRow[] }>('/academics/class-subjects', { query: { classId: classId || undefined } }),
    enabled: open && classId !== '',
  })
  const classSubjects = csData?.items ?? []

  const { data: staffData } = useQuery({
    queryKey: qk.employees(''),
    queryFn: () => api<{ items: EmployeePick[] }>('/employees'),
    enabled: open && !isTeacher,
  })
  const staff = staffData?.items ?? []

  // DialogContent unmounts when closed, so state re-initialises from `editing`
  // on every open — no sync effect needed.

  const save = useMutation({
    mutationFn: () => {
      const body = {
        classId, subjectId,
        teacherId: isTeacher ? undefined : (teacherId === 'NONE' ? null : teacherId),
        title, description, dueDate,
      }
      return editing
        ? api(`/assignments/${editing.id}`, { method: 'PATCH', body })
        : api('/assignments', { method: 'POST', body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      toast.success(editing ? 'Homework updated' : 'Homework posted — students and parents notified')
      onOpenChange(false)
    },
    onError: err => setError(err instanceof Error ? err.message : 'Could not save homework'),
  })

  const valid = classId && subjectId && title.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit homework' : 'Post homework'}</DialogTitle>
          <DialogDescription>
            {isTeacher
              ? 'Students and portal-linked parents in the class are notified when you post.'
              : 'Portal-linked students and their parents are notified when homework is posted.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Class</p>
              <Select
                value={classId}
                onValueChange={v => { setClassId(v); setSubjectId(''); setError(undefined) }}
                disabled={!!editing}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose class" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Subject</p>
              <Select value={subjectId} onValueChange={v => { setSubjectId(v); setError(undefined) }} disabled={classId === ''}>
                <SelectTrigger className="w-full"><SelectValue placeholder={classId === '' ? 'Pick a class first' : 'Choose subject'} /></SelectTrigger>
                <SelectContent>
                  {classSubjects.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No subjects offered in this class yet</div>
                  )}
                  {classSubjects.map(cs => (
                    <SelectItem key={cs.id} value={cs.subject.id}>
                      {cs.subject.name}{cs.subject.code ? ` (${cs.subject.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="hw-title" className="text-sm font-medium">Title</label>
            <Input
              id="hw-title"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(undefined) }}
              placeholder="e.g. Problem Solving Worksheet 5"
              maxLength={140}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="hw-desc" className="text-sm font-medium">
              Instructions <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="hw-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What should students do? Which pages or questions?"
              rows={3}
              maxLength={4000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="hw-due" className="text-sm font-medium">Due date</label>
              <Input id="hw-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            {!isTeacher && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Posted by</p>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unassigned</SelectItem>
                    {staff.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.fullName} — {t.position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => (valid ? save.mutate() : setError('Fill in class, subject, a title (3+ characters) and a due date'))} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? 'Save changes' : 'Post homework'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Submissions / grading dialog ────────────────────────────────────────────
function SubmissionsDialog({ assignment, open, onOpenChange, canGrade }: {
  assignment: AssignmentRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  canGrade: boolean
}) {
  const qc = useQueryClient()
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.assignmentSubmissions(assignment?.id ?? ''),
    queryFn: () => api<{ items: SubmissionRow[] }>(`/assignments/${assignment?.id}/submissions`),
    enabled: open && assignment !== null,
  })

  /** Displayed score = user's pending edit, else the saved score. */
  const scoreFor = (row: SubmissionRow): string =>
    scoreOverrides[row.studentId] ?? (row.submission?.score != null ? String(row.submission.score) : '')

  const resetForm = (o: boolean) => {
    if (!o) {
      setScoreOverrides({})
      setSavingId(null)
      onOpenChange(false)
    }
  }

  const grade = useMutation({
    mutationFn: ({ studentId, score }: { studentId: string; score: number }) =>
      api(`/assignments/${assignment?.id}/submissions`, {
        method: 'PATCH',
        body: { studentId, score },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      toast.success('Score saved')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not save score'),
    onSettled: () => setSavingId(null),
  })

  const items = data?.items ?? []
  const submittedCount = items.filter(i => i.submission !== null).length

  return (
    <Dialog open={open} onOpenChange={resetForm}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submissions — {assignment?.title}</DialogTitle>
          <DialogDescription>
            {assignment?.subject.name} · {assignment?.class.name} · due {assignment ? prettyDate(assignment.dueDate) : ''} — {submittedCount} of {items.length} turned in
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading roster…
          </div>
        ) : items.length === 0 ? (
          <EmptyState compact icon={Users2} title="No students in this class" />
        ) : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {items.map(row => {
              const sub = row.submission
              return (
                <li key={row.studentId} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.admissionNumber}{row.section ? ` · ${row.section}` : ''}
                      {sub?.submittedAt ? ` · ${new Date(sub.submittedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                    {sub?.note && <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">“{sub.note}”</p>}
                  </div>
                  {sub ? (
                    <>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0',
                          sub.status === 'GRADED' && 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
                          sub.status === 'LATE' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {sub.status === 'GRADED' ? `Graded` : sub.status === 'LATE' ? 'Late' : 'Submitted'}
                      </Badge>
                      {canGrade && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            inputMode="numeric"
                            className="h-8 w-20"
                            placeholder="Score"
                            aria-label={`Score for ${row.fullName}`}
                            value={scoreFor(row)}
                            onChange={e => setScoreOverrides(prev => ({ ...prev, [row.studentId]: e.target.value }))}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label={`Save score for ${row.fullName}`}
                            disabled={savingId === row.studentId || !scoreFor(row)}
                            onClick={() => {
                              const n = Number(scoreFor(row))
                              if (!Number.isFinite(n) || n < 0) return
                              setSavingId(row.studentId)
                              grade.mutate({ studentId: row.studentId, score: n })
                            }}
                          >
                            {savingId === row.studentId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              : <SquarePen className="h-3.5 w-3.5" aria-hidden />}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">Missing</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export function HomeworkView() {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('assignments.write'))
  const [classFilter, setClassFilter] = useState('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AssignmentRow | null>(null)
  const [viewing, setViewing] = useState<AssignmentRow | null>(null)
  const [removeTarget, setRemoveTarget] = useState<AssignmentRow | null>(null)

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: qk.assignments({ classId: classFilter === 'ALL' ? undefined : classFilter }),
    queryFn: () => api<{ items: AssignmentRow[] }>('/assignments', {
      query: { classId: classFilter === 'ALL' ? undefined : classFilter, pageSize: 100 },
    }),
  })
  const assignments = data?.items ?? []

  const remove = useMutation({
    mutationFn: (id: string) => api(`/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      toast.success('Homework deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<AssignmentRow, unknown>[]>(() => [
    {
      id: 'title',
      accessorFn: r => r.title,
      header: 'Homework',
      meta: { label: 'Homework' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.title}</p>
          {row.original.description && (
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      id: 'class',
      accessorFn: r => r.class.name,
      header: 'Class',
      meta: { label: 'Class' },
      cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
    },
    {
      id: 'subject',
      accessorFn: r => r.subject.name,
      header: 'Subject',
      meta: { label: 'Subject' },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span>{row.original.subject.name}</span>
          {row.original.subject.code && (
            <span className="font-mono text-xs text-muted-foreground">{row.original.subject.code}</span>
          )}
        </div>
      ),
    },
    {
      id: 'teacher',
      accessorFn: r => r.teacher?.fullName ?? '',
      header: 'Posted by',
      meta: { label: 'Posted by' },
      cell: ({ getValue }) => getValue()
        ? <span className="text-sm">{String(getValue())}</span>
        : <span className="text-sm text-muted-foreground">—</span>,
    },
    {
      id: 'dueDate',
      accessorFn: r => r.dueDate,
      header: 'Due',
      meta: { label: 'Due' },
      cell: ({ row }) => {
        const overdue = row.original.dueDate < todayIso()
        return (
          <span className={cn('text-sm tabular-nums', overdue ? 'text-destructive' : '')}>
            {prettyDate(row.original.dueDate)}
          </span>
        )
      },
    },
    {
      id: 'submissions',
      accessorFn: r => r._count?.submissions ?? 0,
      header: 'Turned in',
      meta: { label: 'Turned in' },
      cell: ({ row }) => {
        const done = row.original._count?.submissions ?? 0
        const roster = row.original.class._count?.students ?? 0
        const pct = roster > 0 ? Math.round((done / roster) * 100) : 0
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{done}/{roster}</span>
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const a = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs"
              onClick={() => setViewing(a)}
              aria-label={`View submissions for ${a.title}`}
            >
              <Users2 className="h-3.5 w-3.5" aria-hidden /> Submissions
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  aria-label={`Edit ${a.title}`}
                  onClick={() => { setEditing(a); setDialogOpen(true) }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={`Delete ${a.title}`}
                  onClick={() => setRemoveTarget(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ], [canWrite])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Homework</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Post assignments with due dates — portal-linked students and parents are notified instantly
        </p>
      </div>

      <DataTable<AssignmentRow>
        columns={columns}
        data={assignments}
        loading={isLoading}
        rowId={a => a.id}
        searchPlaceholder="Search homework…"
        searchExtractor={a => `${a.title} ${a.subject.name} ${a.class.name} ${a.teacher?.fullName ?? ''}`}
        initialPageSize={25}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger size="sm" className="w-40" aria-label="Filter by class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => { setEditing(null); setDialogOpen(true) }}
              >
                <Plus aria-hidden /> Post homework
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={NotebookPen}
            title="No homework posted"
            description="Homework you post here reaches the student and parent portals instantly, with due dates and submission tracking."
            action={canWrite && classes.length > 0 ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> Post homework</Button>
            ) : undefined}
          />
        }
      />

      <HomeworkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
      <SubmissionsDialog
        assignment={viewing}
        open={viewing !== null}
        onOpenChange={o => { if (!o) setViewing(null) }}
        canGrade={canWrite}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={o => { if (!o) setRemoveTarget(null) }}
        title={`Delete "${removeTarget?.title ?? ''}"?`}
        description="The homework disappears from the student and parent portals. Submitted records are removed with it."
        confirmLabel="Delete homework" destructive
        onConfirm={async () => { if (removeTarget) await remove.mutateAsync(removeTarget.id) }}
      />
    </motion.div>
  )
}
