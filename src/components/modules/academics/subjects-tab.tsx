'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { BookMarked, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'

interface SubjectRow {
  id: string; name: string; code: string | null; isCore: boolean
  _count: { classSubjects: number }
}

const subjectFormSchema = z.object({
  name: z.string().trim().min(2, 'Subject name is required').max(80),
  code: z.string().trim().max(10, 'Code is too long'),
  isCore: z.boolean(),
})
type SubjectValues = z.infer<typeof subjectFormSchema>

function SubjectDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: SubjectRow | null }) {
  const qc = useQueryClient()
  const form = useForm<SubjectValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: { name: '', code: '', isCore: true },
  })
  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name, code: editing.code ?? '', isCore: editing.isCore }
      : { name: '', code: '', isCore: true })
  }

  const save = useMutation({
    mutationFn: (v: SubjectValues) => editing
      ? api(`/academics/subjects/${editing.id}`, { method: 'PATCH', body: v })
      : api('/academics/subjects', { method: 'POST', body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success(editing ? 'Subject updated' : 'Subject created')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit subject' : 'New subject'}</DialogTitle>
          <DialogDescription>Core subjects appear on report cards by default.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="sub-name">Subject name</Label>
              <Input id="sub-name" placeholder="Mathematics" {...form.register('name')} />
              <FieldError message={errs.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-code">Code</Label>
              <Input id="sub-code" placeholder="MTH" className="w-24 uppercase" {...form.register('code')} />
              <FieldError message={errs.code?.message} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.watch('isCore')} onCheckedChange={c => form.setValue('isCore', c === true)} />
            Core subject
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create subject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SubjectsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SubjectRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.subjects(),
    queryFn: () => api<{ items: SubjectRow[] }>('/academics/subjects'),
  })
  const subjects = data?.items ?? []

  const removeSubject = useMutation({
    mutationFn: (id: string) => api(`/academics/subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Subject deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<SubjectRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Subject',
      meta: { label: 'Subject' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookMarked className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'code',
      header: 'Code',
      meta: { label: 'Code' },
      cell: ({ getValue }) => <Badge variant="outline" className="font-mono">{(getValue() as string) || '—'}</Badge>,
    },
    {
      accessorKey: 'isCore',
      header: 'Type',
      meta: { label: 'Type' },
      cell: ({ getValue }) => getValue()
        ? <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Core</Badge>
        : <Badge variant="outline" className="text-muted-foreground">Elective</Badge>,
    },
    {
      id: 'classes',
      accessorFn: r => r._count.classSubjects,
      header: 'Classes offering',
      meta: { label: 'Classes offering' },
      cell: ({ getValue }) => `${Number(getValue())} class(es)`,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const s = row.original
        if (!canWrite) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${s.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => { setEditing(s); setDialogOpen(true) }}>
                <Pencil aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(s)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite])

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <DataTable<SubjectRow>
        columns={columns}
        data={subjects}
        loading={isLoading}
        rowId={s => s.id}
        searchPlaceholder="Search subjects…"
        searchExtractor={s => `${s.name} ${s.code ?? ''}`}
        initialPageSize={20}
        toolbar={canWrite ? (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus aria-hidden /> New subject
          </Button>
        ) : undefined}
        emptyState={
          <EmptyState
            icon={BookMarked}
            title="No subjects yet"
            description="Add subjects like Mathematics, English and Basic Science before assigning teachers."
            action={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> New subject</Button> : undefined}
          />
        }
      />

      <SubjectDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description="Subjects offered in any class block deletion — remove the class assignments first."
        confirmLabel="Delete subject" destructive
        onConfirm={async () => { if (deleteTarget) await removeSubject.mutateAsync(deleteTarget.id) }}
      />
    </motion.div>
  )
}
