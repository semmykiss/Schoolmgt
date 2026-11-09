'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { CalendarClock, Coffee, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { periodCreateSchema } from '@/lib/validation/timetable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

interface PeriodRow {
  id: string; name: string; startTime: string; endTime: string
  order: number; isBreak: boolean
  _count: { slots: number }
}

const formSchema = z.object({
  name: z.string().trim().min(2, 'Period name is required').max(40),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a start time'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick an end time'),
  order: z.number({ message: 'Enter an order' }).int().min(1).max(30),
  isBreak: z.boolean(),
})
type Values = z.infer<typeof formSchema>

function PeriodDialog({ open, onOpenChange, editing, nextOrder }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: PeriodRow | null; nextOrder: number
}) {
  const qc = useQueryClient()
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', startTime: '08:00', endTime: '08:40', order: nextOrder, isBreak: false },
  })

  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name, startTime: editing.startTime, endTime: editing.endTime, order: editing.order, isBreak: editing.isBreak }
      : { name: '', startTime: '08:00', endTime: '08:40', order: nextOrder, isBreak: false })
  }

  const save = useMutation({
    mutationFn: (v: Values) => {
      const payload = { name: v.name, startTime: v.startTime, endTime: v.endTime, order: v.order, isBreak: v.isBreak }
      return editing
        ? api(`/timetable/periods/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/timetable/periods', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] })
      toast.success(editing ? 'Period updated' : 'Period created')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit period' : 'New period'}</DialogTitle>
          <DialogDescription>
            Periods run in `order` across the day. Tick “Break” for free rows that never get scheduled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="per-name">Name</Label>
            <Input id="per-name" placeholder="Period 1" {...form.register('name')} />
            <FieldError message={errs.name?.message} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="per-start">Starts</Label>
              <Input id="per-start" type="time" {...form.register('startTime')} />
              <FieldError message={errs.startTime?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="per-end">Ends</Label>
              <Input id="per-end" type="time" {...form.register('endTime')} />
              <FieldError message={errs.endTime?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="per-order">Order</Label>
              <Input id="per-order" type="number" min={1} max={30} {...form.register('order', { valueAsNumber: true })} />
              <FieldError message={errs.order?.message} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="per-break" className="text-sm">Break / assembly</Label>
              <p className="text-xs text-muted-foreground">Shown as a divider row — cannot hold lessons.</p>
            </div>
            <Controller
              name="isBreak" control={form.control}
              render={({ field }) => (
                <Switch id="per-break" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create period'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PeriodsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PeriodRow | null>(null)
  const [deleting, setDeleting] = useState<PeriodRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.periods(),
    queryFn: () => api<{ items: PeriodRow[] }>('/timetable/periods'),
  })
  const periods = data?.items ?? []
  const nextOrder = periods.length ? Math.max(...periods.map(p => p.order)) + 1 : 1

  const remove = useMutation({
    mutationFn: (id: string) => api(`/timetable/periods/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] })
      toast.success('Period deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<PeriodRow, unknown>[]>(() => [
    {
      accessorKey: 'order',
      header: '#',
      meta: { label: 'Order' },
      cell: ({ getValue }) => <span className="text-sm font-medium text-muted-foreground">{Number(getValue())}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Period',
      meta: { label: 'Period' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {row.original.isBreak
              ? <Coffee className="h-4 w-4" aria-hidden />
              : <CalendarClock className="h-4 w-4" aria-hidden />}
          </span>
          <p className="font-medium leading-tight">{row.original.name}</p>
        </div>
      ),
    },
    {
      id: 'time',
      accessorFn: r => `${r.startTime} – ${r.endTime}`,
      header: 'Time',
      meta: { label: 'Time' },
    },
    {
      id: 'type',
      accessorFn: r => r.isBreak,
      header: 'Type',
      meta: { label: 'Type' },
      cell: ({ row }) => row.original.isBreak
        ? <Badge variant="outline" className="text-amber-700 dark:text-amber-400">Break</Badge>
        : <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">Teaching</Badge>,
    },
    {
      id: 'slots',
      accessorFn: r => r._count.slots,
      header: 'Scheduled slots',
      meta: { label: 'Slots' },
      cell: ({ getValue }) => <span className="text-sm">{Number(getValue())}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false, enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        if (!canWrite) return null
        const p = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${p.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => { setEditing(p); setDialogOpen(true) }}>
                <Pencil aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
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
      <DataTable<PeriodRow>
        columns={columns}
        data={periods}
        loading={isLoading}
        rowId={p => p.id}
        searchPlaceholder="Search periods…"
        searchExtractor={p => p.name}
        initialPageSize={20}
        toolbar={canWrite ? (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus aria-hidden /> New period
          </Button>
        ) : undefined}
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title="No periods yet"
            description="Define the daily rhythm first — e.g. 8 teaching periods plus a break."
            action={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> New period</Button> : undefined}
          />
        }
      />

      <PeriodDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        editing={editing} nextOrder={nextOrder}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={o => { if (!o) setDeleting(null) }}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Periods with scheduled timetable slots cannot be deleted — clear them from the class grids first."
        confirmLabel="Delete period" destructive
        onConfirm={async () => { if (deleting) await remove.mutateAsync(deleting.id) }}
      />
    </motion.div>
  )
}
