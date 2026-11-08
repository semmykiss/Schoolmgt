'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  GraduationCap, Layers, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Users,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { classCreateSchema, classUpdateSchema } from '@/lib/validation/academic'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { CATEGORY_LABEL } from './academic-helpers'

// ── data shapes ─────────────────────────────────────────────────────────────
interface SectionRow {
  id: string; name: string; capacity: number
  formTeacher: { id: string; fullName: string; staffCode: string } | null
}
interface ClassRow {
  id: string; name: string; level: number; category: string | null
  sections: SectionRow[]
  _count: { students: number; sections: number; classSubjects: number }
}
interface EmployeePick {
  id: string; fullName: string; staffCode: string; position: string
}

const CATEGORIES = ['PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'] as const

// ── class dialog ────────────────────────────────────────────────────────────
const classFormSchema = z.object({
  name: z.string().trim().min(2, 'Class name is required, e.g. JSS 1').max(60),
  level: z.number({ message: 'Enter a level' }).int('Level must be a whole number').min(1, 'Level must be at least 1').max(20, 'Level is too large'),
  category: z.string(),
})
type ClassValues = z.infer<typeof classFormSchema>

function ClassDialog({ open, onOpenChange, editing, nextLevel }: { open: boolean; onOpenChange: (o: boolean) => void; editing: ClassRow | null; nextLevel: number }) {
  const qc = useQueryClient()
  const form = useForm<ClassValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: '', level: 1, category: 'NONE' },
  })

  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name, level: editing.level, category: editing.category ?? 'NONE' }
      : { name: '', level: nextLevel, category: 'NONE' })
  }

  const save = useMutation({
    mutationFn: (v: ClassValues) => {
      const payload = { name: v.name, level: v.level, category: v.category === 'NONE' ? undefined : v.category }
      return editing
        ? api(`/academics/classes/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/academics/classes', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(editing ? 'Class updated' : 'Class created')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit class' : 'New class'}</DialogTitle>
          <DialogDescription>Level orders classes for promotions (Primary 4 → Primary 5 → JSS 1 …).</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cls-name">Class name</Label>
            <Input id="cls-name" placeholder="JSS 1" {...form.register('name')} />
            <FieldError message={errs.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cls-level">Level (promotion order)</Label>
              <Input id="cls-level" type="number" min={1} max={20} {...form.register('level', { valueAsNumber: true })} />
              <FieldError message={errs.level?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cls-cat">Category</Label>
              <Controller
                name="category" control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cls-cat" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Not set</SelectItem>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── section dialog ──────────────────────────────────────────────────────────
const sectionFormSchema = z.object({
  name: z.string().trim().min(1, 'Section name is required, e.g. A').max(10),
  capacity: z.number({ message: 'Enter a capacity' }).int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(200, 'Capacity is too large'),
  formTeacherId: z.string(),
})
type SectionValues = z.infer<typeof sectionFormSchema>

function SectionDialog({ open, onOpenChange, classRow, editing }: {
  open: boolean; onOpenChange: (o: boolean) => void; classRow: ClassRow; editing: SectionRow | null
}) {
  const qc = useQueryClient()
  const [teacherSearch, setTeacherSearch] = useState('')
  const { data: staffData } = useQuery({
    queryKey: qk.employees(teacherSearch),
    queryFn: () => api<{ items: EmployeePick[] }>('/employees', { query: { search: teacherSearch || undefined } }),
    enabled: open,
  })
  const staff = staffData?.items ?? []

  const form = useForm<SectionValues>({
    resolver: zodResolver(sectionFormSchema),
    defaultValues: { name: '', capacity: 40, formTeacherId: 'NONE' },
  })
  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name, capacity: editing.capacity, formTeacherId: editing.formTeacher?.id ?? 'NONE' }
      : { name: '', capacity: 40, formTeacherId: 'NONE' })
  }

  const save = useMutation({
    mutationFn: (v: SectionValues) => {
      const payload = { name: v.name, capacity: v.capacity, formTeacherId: v.formTeacherId === 'NONE' ? null : v.formTeacherId }
      return editing
        ? api(`/academics/sections/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/academics/sections', { method: 'POST', body: { ...payload, classId: classRow.id } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success(editing ? 'Section updated' : 'Section added')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit section ${editing.name}` : `Add section to ${classRow.name}`}</DialogTitle>
          <DialogDescription>Sections split a class into arms (A, B…) and each has one form teacher.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sec-name">Section name</Label>
              <Input id="sec-name" placeholder="A" {...form.register('name')} />
              <FieldError message={errs.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-cap">Capacity</Label>
              <Input id="sec-cap" type="number" min={1} max={200} {...form.register('capacity', { valueAsNumber: true })} />
              <FieldError message={errs.capacity?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sec-ft">Form teacher</Label>
            <Controller
              name="formTeacherId" control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="sec-ft" className="w-full"><SelectValue placeholder="Assign later" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not assigned</SelectItem>
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName} — {s.position} ({s.staffCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Input
              placeholder="Filter staff by name…" value={teacherSearch}
              onChange={e => setTeacherSearch(e.target.value)} className="mt-1.5 h-8 text-xs"
              aria-label="Filter staff"
            />
            <FieldError message={errs.formTeacherId?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Add section'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── main tab ────────────────────────────────────────────────────────────────
export function ClassesTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [classDialogOpen, setClassDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassRow | null>(null)
  const [sectionsClass, setSectionsClass] = useState<ClassRow | null>(null)
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<SectionRow | null>(null)
  const [deleteClass, setDeleteClass] = useState<ClassRow | null>(null)
  const [deleteSection, setDeleteSection] = useState<SectionRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = data?.items ?? []
  const nextLevel = classes.length ? Math.max(...classes.map(c => c.level)) + 1 : 1

  const removeClass = useMutation({
    mutationFn: (id: string) => api(`/academics/classes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Class deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })
  const removeSection = useMutation({
    mutationFn: (id: string) => api(`/academics/sections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Section deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<ClassRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Class',
      meta: { label: 'Class' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="font-medium leading-tight">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              Level {row.original.level}{row.original.category ? ` • ${CATEGORY_LABEL[row.original.category]}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'sections',
      header: 'Sections',
      meta: { label: 'Sections' },
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.sections.length === 0 && <span className="text-muted-foreground">—</span>}
          {row.original.sections.map(sec => (
            <Badge key={sec.id} variant="outline">
              {sec.name}
              {sec.formTeacher && <span className="ml-1 text-muted-foreground">· {sec.formTeacher.fullName}</span>}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: 'students',
      accessorFn: r => r._count.students,
      header: 'Students',
      meta: { label: 'Students' },
      cell: ({ getValue }) => (
        <span className="flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {Number(getValue())}
        </span>
      ),
    },
    {
      id: 'subjects',
      accessorFn: r => r._count.classSubjects,
      header: 'Subjects',
      meta: { label: 'Subjects' },
      cell: ({ getValue }) => Number(getValue()),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const c = row.original
        if (!canWrite) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${c.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => { setSectionsClass(c); setEditingSection(null); setSectionDialogOpen(true) }}>
                <Plus aria-hidden /> Add section
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setEditingClass(c); setClassDialogOpen(true) }}>
                <Pencil aria-hidden /> Edit class
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteClass(c)}>
                <Trash2 aria-hidden /> Delete class
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite])

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <DataTable<ClassRow>
        columns={columns}
        data={classes}
        loading={isLoading}
        rowId={c => c.id}
        searchPlaceholder="Search classes…"
        searchExtractor={c => `${c.name} ${c.category ?? ''}`}
        initialPageSize={20}
        toolbar={canWrite ? (
          <Button size="sm" onClick={() => { setEditingClass(null); setClassDialogOpen(true) }}>
            <Plus aria-hidden /> New class
          </Button>
        ) : undefined}
        emptyState={
          <EmptyState
            icon={GraduationCap}
            title="No classes yet"
            description="Create classes from Primary 1 up to SS 3 — levels drive promotions."
            action={canWrite ? <Button onClick={() => { setEditingClass(null); setClassDialogOpen(true) }}><Plus aria-hidden /> New class</Button> : undefined}
          />
        }
      />

      <p className="text-sm text-muted-foreground">Tip: click a class row to manage its sections and form teachers.</p>

      <Dialog open={sectionsClass !== null} onOpenChange={o => { if (!o) setSectionsClass(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sectionsClass?.name} — sections</DialogTitle>
            <DialogDescription>{sectionsClass?._count.students} active students across {sectionsClass?.sections.length ?? 0} section(s)</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {sectionsClass?.sections.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No sections yet — students land unassigned until you add one.</p>
            )}
            {sectionsClass?.sections.map(sec => (
              <div key={sec.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{sectionsClass.name} {sec.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Form teacher: {sec.formTeacher ? `${sec.formTeacher.fullName} (${sec.formTeacher.staffCode})` : 'not assigned'} · capacity {sec.capacity}
                  </p>
                </div>
                {canWrite && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for section ${sec.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => { setEditingSection(sec); setSectionDialogOpen(true) }}>
                        <Pencil aria-hidden /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleteSection(sec)}>
                        <Trash2 aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
          <Separator />
          {canWrite && (
            <Button
              onClick={() => { setEditingSection(null); setSectionDialogOpen(true) }}
              className="w-full"
              disabled={!sectionsClass}
            >
              <Plus aria-hidden /> Add section
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <ClassDialog
        open={classDialogOpen} onOpenChange={setClassDialogOpen}
        editing={editingClass} nextLevel={nextLevel}
      />
      {sectionsClass && (
        <SectionDialog
          open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}
          classRow={sectionsClass} editing={editingSection}
        />
      )}
      <ConfirmDialog
        open={deleteClass !== null}
        onOpenChange={o => { if (!o) setDeleteClass(null) }}
        title={`Delete ${deleteClass?.name ?? ''}?`}
        description="Sections and subject assignments under it are removed. Active students or open applications block deletion."
        confirmLabel="Delete class" destructive
        onConfirm={async () => { if (deleteClass) await removeClass.mutateAsync(deleteClass.id) }}
      />
      <ConfirmDialog
        open={deleteSection !== null}
        onOpenChange={o => { if (!o) setDeleteSection(null) }}
        title={`Delete section ${deleteSection?.name ?? ''}?`}
        description="Students in this section block deletion — move them to another section first."
        confirmLabel="Delete section" destructive
        onConfirm={async () => { if (deleteSection) await removeSection.mutateAsync(deleteSection.id) }}
      />
    </motion.div>
  )
}
