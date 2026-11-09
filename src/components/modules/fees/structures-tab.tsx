'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { formatNaira, koboToNaira } from '@/lib/money'
import { fmtDate } from '@/components/modules/academics/academic-helpers'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface StructureRow {
  id: string
  name: string
  classId: string
  termId: string
  sessionId: string
  items: string
  totalAmount: number
  isActive: boolean
  createdAt: string
  class: { name: string } | null
}

interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; sessionId: string; session?: { name: string } }

const schema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  classId: z.string().min(1, 'Select the class'),
  termId: z.string().min(1, 'Select the term'),
  dueDefault: z.string().optional(),
})

type Form = z.infer<typeof schema>

const emptyItem = { label: '', amountNaira: '' }

export function StructuresTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StructureRow | null>(null)
  const [editTarget, setEditTarget] = useState<StructureRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.feeStructures({}),
    queryFn: () => api<{ items: StructureRow[] }>('/fees/structures?pageSize=200'),
  })
  const { data: terms } = useQuery({
    queryKey: qk.terms(),
    queryFn: () => api<{ items: TermRow[] }>('/academics/terms?pageSize=100'),
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['fees'] })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/fees/structures/${id}`, { method: 'PATCH', body: { isActive } }),
    onSuccess: () => { toast.success('Saved'); invalidate() },
    onError: e => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api<{ deactivated?: boolean; invoiceCount?: number }>(`/fees/structures/${id}`, { method: 'DELETE' }),
    onSuccess: res => {
      toast.success(res.deactivated
        ? `Deactivated — used by ${res.invoiceCount} invoice(s)`
        : 'Fee structure deleted')
      setDeleteTarget(null)
      invalidate()
    },
    onError: e => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<StructureRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.class?.name ?? '—'}</p>
        </div>
      ),
    },
    {
      id: 'term',
      header: 'Term',
      cell: ({ row }) => {
        const term = terms?.items.find(t => t.id === row.original.termId)
        return <span className="text-sm text-muted-foreground">{term?.name ?? '—'}</span>
      },
    },
    {
      accessorKey: 'totalAmount',
      header: 'Total',
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatNaira(row.original.totalAmount)}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{fmtDate(row.original.createdAt?.slice(0, 10))}</span>,
    },
    {
      id: 'active',
      header: 'Active',
      enableSorting: false,
      cell: ({ row }) => canWrite ? (
        <Switch
          checked={row.original.isActive}
          onCheckedChange={v => toggleActive.mutate({ id: row.original.id, isActive: v })}
          aria-label={`Toggle ${row.original.name}`}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="text-sm text-muted-foreground">{row.original.isActive ? 'Yes' : 'No'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          {canWrite && (
            <Button
              variant="ghost" size="icon" aria-label={`Delete ${row.original.name}`}
              onClick={e => { e.stopPropagation(); setDeleteTarget(row.original) }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, terms, toggleActive])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> New fee structure</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No fee structures"
          description={canWrite
            ? 'Create a fee structure per class and term (e.g. "JSS 1 — First Term Fees"), then bulk-generate invoices from it.'
            : 'Fee structures will appear here once the bursar creates them.'}
          action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> New fee structure</Button> : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data.items}
          rowId={r => r.id}
          searchPlaceholder="Search structures…"
          searchExtractor={r => `${r.name} ${r.class?.name ?? ''}`}
          enableColumnToggle={false}
          onRowClick={r => setEditTarget(r)}
        />
      )}

      {canWrite && (
        <StructureDialog
          open={createOpen || !!editTarget}
          editing={editTarget}
          terms={terms?.items ?? []}
          onOpenChange={o => { setCreateOpen(o); if (!o) setEditTarget(null) }}
          onSaved={() => { setCreateOpen(false); setEditTarget(null); invalidate() }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        description="Structures already used by invoices are deactivated instead of deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </div>
  )
}

function StructureDialog({ open, editing, terms, onOpenChange, onSaved }: {
  open: boolean
  editing: StructureRow | null
  terms: TermRow[]
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [items, setItems] = useState([{ ...emptyItem }])
  const [itemsLoadedFor, setItemsLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState('')

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', classId: '', termId: '' },
  })

  // load items of the structure being edited
  if (editing && itemsLoadedFor !== editing.id) {
    setItemsLoadedFor(editing.id)
    setItems(parseStructureItems(editing.items))
    form.reset({ name: editing.name, classId: editing.classId, termId: editing.termId })
  }
  if (!editing && itemsLoadedFor !== null) {
    setItemsLoadedFor(null)
    setItems([{ ...emptyItem }])
    form.reset({ name: '', classId: '', termId: '' })
  }

  const { data: classes } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes?pageSize=100'),
    enabled: open,
  })

  const parsedItems = items
    .filter(i => i.label.trim() && Number(i.amountNaira) > 0)
    .map(i => ({ label: i.label.trim(), amount: Math.round(Number(i.amountNaira.replace(/,/g, '')) * 100) }))
  const total = parsedItems.reduce((s, i) => s + i.amount, 0)

  const save = useMutation({
    mutationFn: (values: Form) => {
      const body = {
        name: values.name,
        classId: values.classId,
        termId: values.termId,
        sessionId: terms.find(t => t.id === values.termId)?.sessionId,
        items: parsedItems,
        isActive: editing?.isActive ?? true,
      }
      return editing
        ? api(`/fees/structures/${editing.id}`, { method: 'PATCH', body })
        : api('/fees/structures', { method: 'POST', body })
    },
    onSuccess: () => {
      toast.success(editing ? 'Fee structure updated' : 'Fee structure created')
      onSaved()
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) setError('') }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit fee structure' : 'New fee structure'}</DialogTitle>
          <DialogDescription>Per-class, per-term pricing used for bulk invoicing.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(v => {
            if (parsedItems.length === 0) { setError('Add at least one complete fee item'); return }
            setError('')
            save.mutate(v)
          })}
        >
          <div className="space-y-1.5">
            <Label htmlFor="fs-name">Name</Label>
            <Input id="fs-name" placeholder="e.g. JSS 1 — First Term Fees" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fs-class">Class</Label>
              <Select value={form.watch('classId')} onValueChange={v => form.setValue('classId', v, { shouldValidate: true })}>
                <SelectTrigger id="fs-class" aria-invalid={!!form.formState.errors.classId}>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {(classes?.items ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.classId && <p className="text-xs text-destructive">{form.formState.errors.classId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fs-term">Term</Label>
              <Select value={form.watch('termId')} onValueChange={v => form.setValue('termId', v, { shouldValidate: true })}>
                <SelectTrigger id="fs-term" aria-invalid={!!form.formState.errors.termId}>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.session?.name ? ` — ${t.session.name}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.termId && <p className="text-xs text-destructive">{form.formState.errors.termId.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fee items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="e.g. Tuition"
                  value={item.label}
                  onChange={e => setItems(arr => arr.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                  aria-label={`Fee item ${idx + 1} label`}
                />
                <Input
                  className="w-36" inputMode="decimal" placeholder="₦0"
                  value={item.amountNaira}
                  onChange={e => setItems(arr => arr.map((it, i) => i === idx ? { ...it, amountNaira: e.target.value } : it))}
                  aria-label={`Fee item ${idx + 1} amount`}
                />
                <Button
                  type="button" variant="ghost" size="icon" aria-label={`Remove item ${idx + 1}`}
                  disabled={items.length === 1}
                  onClick={() => setItems(arr => arr.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems(arr => [...arr, { ...emptyItem }])}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Add item
            </Button>
          </div>

          <div className="flex justify-between rounded-lg border bg-muted/40 p-3 text-sm font-semibold">
            <span>Total per student</span>
            <span className="tabular-nums">{formatNaira(total)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create structure'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function parseStructureItems(json: string): { label: string; amountNaira: string }[] {
  try {
    const parsed = JSON.parse(json) as { label: string; amount: number }[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [{ ...emptyItem }]
    return parsed.map(i => ({ label: i.label, amountNaira: String(koboToNaira(i.amount)) }))
  } catch {
    return [{ ...emptyItem }]
  }
}
