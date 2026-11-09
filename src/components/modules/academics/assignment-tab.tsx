'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, UserRoundCheck, Users2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

interface ClassSubjectRow {
  id: string
  class: { id: string; name: string; level: number }
  subject: { id: string; name: string; code: string | null; isCore: boolean }
  teacher: { id: string; fullName: string; staffCode: string } | null
  _count: { lessonPlans: number }
}
interface ClassRow { id: string; name: string; level: number }
interface SubjectRow { id: string; name: string; code: string | null }
interface EmployeePick { id: string; fullName: string; staffCode: string; position: string }

function AddAssignmentDialog({ open, onOpenChange, classId, subjects, existing }: {
  open: boolean; onOpenChange: (o: boolean) => void
  classId: string; subjects: SubjectRow[]; existing: ClassSubjectRow[]
}) {
  const qc = useQueryClient()
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('NONE')
  const [error, setError] = useState<string | undefined>()

  const { data: staffData } = useQuery({
    queryKey: qk.employees(''),
    queryFn: () => api<{ items: EmployeePick[] }>('/employees'),
    enabled: open,
  })
  const staff = staffData?.items ?? []
  const offeredIds = new Set(existing.map(cs => cs.subject.id))
  const available = subjects.filter(s => !offeredIds.has(s.id))

  const add = useMutation({
    mutationFn: () => api('/academics/class-subjects', {
      method: 'POST',
      body: { classId, subjectId, teacherId: teacherId === 'NONE' ? null : teacherId },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Subject added to class')
      setSubjectId(''); setTeacherId('NONE'); setError(undefined)
      onOpenChange(false)
    },
    onError: err => {
      setError(err instanceof Error ? err.message : 'Could not add subject')
    },
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!add.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Offer a subject in this class</DialogTitle>
          <DialogDescription>Pick the subject and optionally assign its teacher now.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Subject</p>
            <Select value={subjectId} onValueChange={v => { setSubjectId(v); setError(undefined) }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose subject" /></SelectTrigger>
              <SelectContent>
                {available.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">All subjects are already offered here</div>}
                {available.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Teacher</p>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Assign later</SelectItem>
                {staff.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.fullName} — {t.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FieldError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>Cancel</Button>
            <Button onClick={() => subjectId ? add.mutate() : setError('Choose a subject')} disabled={add.isPending || available.length === 0}>
              {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Add subject
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AssignmentTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [classFilter, setClassFilter] = useState('ALL')
  const [addOpen, setAddOpen] = useState(false)
  const [addClass, setAddClass] = useState<ClassRow | null>(null)
  const [removeTarget, setRemoveTarget] = useState<ClassSubjectRow | null>(null)
  const [teacherMenuFor, setTeacherMenuFor] = useState<ClassSubjectRow | null>(null)

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []

  const { data: subjectsData } = useQuery({
    queryKey: qk.subjects(),
    queryFn: () => api<{ items: SubjectRow[] }>('/academics/subjects'),
  })
  const subjects = subjectsData?.items ?? []

  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: qk.classSubjects(classFilter === 'ALL' ? undefined : classFilter),
    queryFn: () => api<{ items: ClassSubjectRow[] }>('/academics/class-subjects', {
      query: { classId: classFilter === 'ALL' ? undefined : classFilter },
    }),
  })
  const assignments = assignmentsData?.items ?? []

  const { data: staffData } = useQuery({
    queryKey: qk.employees(''),
    queryFn: () => api<{ items: EmployeePick[] }>('/employees'),
  })
  const staff = staffData?.items ?? []

  const assignTeacher = useMutation({
    mutationFn: ({ id, teacherId }: { id: string; teacherId: string | null }) =>
      api(`/academics/class-subjects/${id}`, { method: 'PATCH', body: { teacherId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      setTeacherMenuFor(null)
      toast.success('Teacher assigned')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })
  const removeAssignment = useMutation({
    mutationFn: (id: string) => api(`/academics/class-subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Subject removed from class')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const filtered = useMemo(() => (
    classFilter === 'ALL' ? assignments : assignments.filter(a => a.class.id === classFilter)
  ), [assignments, classFilter])

  const columns = useMemo<ColumnDef<ClassSubjectRow, unknown>[]>(() => [
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
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.subject.name}</span>
          {row.original.subject.code && <span className="font-mono text-xs text-muted-foreground">{row.original.subject.code}</span>}
        </div>
      ),
    },
    {
      id: 'teacher',
      accessorFn: r => r.teacher?.fullName ?? '',
      header: 'Teacher',
      meta: { label: 'Teacher' },
      cell: ({ row }) => {
        const a = row.original
        const isEditing = teacherMenuFor?.id === a.id
        if (isEditing) {
          return (
            <Select
              defaultOpen
              value={a.teacher?.id ?? 'NONE'}
              onValueChange={v => assignTeacher.mutate({ id: a.id, teacherId: v === 'NONE' ? null : v })}
            >
              <SelectTrigger size="sm" className="w-56" aria-label={`Teacher for ${a.subject.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not assigned</SelectItem>
                {staff.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.fullName} — {t.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        return a.teacher ? (
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => canWrite && setTeacherMenuFor(a)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
            aria-label={`Change teacher for ${a.subject.name}`}
          >
            <UserRoundCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            {a.teacher.fullName}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => canWrite && setTeacherMenuFor(a)}
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground disabled:no-underline disabled:cursor-default"
            aria-label={`Assign teacher to ${a.subject.name}`}
          >
            Assign teacher…
          </button>
        )
      },
    },
    {
      id: 'plans',
      accessorFn: r => r._count.lessonPlans,
      header: 'Plans',
      meta: { label: 'Plans' },
      cell: ({ getValue }) => Number(getValue()) || <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const a = row.original
        if (!canWrite) return null
        return (
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Remove ${a.subject.name} from ${a.class.name}`}
            onClick={() => setRemoveTarget(a)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )
      },
    },
  ], [canWrite, staff, teacherMenuFor, assignTeacher])

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <DataTable<ClassSubjectRow>
        columns={columns}
        data={filtered}
        loading={isLoading}
        rowId={a => a.id}
        searchPlaceholder="Search subject or teacher…"
        searchExtractor={a => `${a.subject.name} ${a.subject.code ?? ''} ${a.teacher?.fullName ?? ''} ${a.class.name}`}
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
                onClick={() => {
                  const target = classFilter !== 'ALL' ? classes.find(c => c.id === classFilter) : null
                  setAddClass(target ?? classes[0] ?? null)
                  setAddOpen(true)
                }}
                disabled={classes.length === 0}
              >
                <Plus aria-hidden /> Offer subject
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={Users2}
            title="No subject assignments"
            description="Choose which subjects each class offers and assign teachers — this powers timetables, exams and lesson plans."
            action={canWrite && classes.length > 0 && subjects.length > 0 ? (
              <Button onClick={() => { setAddClass(classes[0] ?? null); setAddOpen(true) }}><Plus aria-hidden /> Offer subject</Button>
            ) : undefined}
          />
        }
      />

      <AddAssignmentDialog
        open={addOpen} onOpenChange={setAddOpen}
        classId={addClass?.id ?? ''} subjects={subjects} existing={assignments}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={o => { if (!o) setRemoveTarget(null) }}
        title={`Remove ${removeTarget?.subject.name ?? ''} from ${removeTarget?.class.name ?? ''}?`}
        description="Timetable slots and lesson plans under this assignment are removed. Recorded exam results block removal."
        confirmLabel="Remove subject" destructive
        onConfirm={async () => { if (removeTarget) await removeAssignment.mutateAsync(removeTarget.id) }}
      />
    </motion.div>
  )
}
