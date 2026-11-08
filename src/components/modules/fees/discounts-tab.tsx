'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Plus, ToggleLeft, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { formatNaira } from '@/lib/money'
import { DISCOUNT_TYPES } from '@/lib/validation/fees'
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

interface DiscountRow {
  id: string
  name: string
  type: 'PERCENT' | 'FIXED'
  value: number
  active: boolean
  createdAt: string
  student: { firstName: string; lastName: string; admissionNumber: string }
}

interface StudentOption { id: string; firstName: string; lastName: string; admissionNumber: string }

const schema = z.object({
  studentId: z.string().min(1, 'Select the student'),
  name: z.string().min(2, 'Name is required').max(120),
  type: z.enum(DISCOUNT_TYPES),
  value: z.coerce.number().int().min(1, 'Value must be at least 1'),
})

type Form = z.infer<typeof schema>

function valueLabel(d: DiscountRow): string {
  return d.type === 'PERCENT' ? `${d.value}%` : formatNaira(d.value)
}

export function DiscountsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DiscountRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.discounts({}),
    queryFn: () => api<{ items: DiscountRow[] }>('/fees/discounts?pageSize=200'),
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['fees'] })

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/fees/discounts/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => { toast.success('Saved'); invalidate() },
    onError: e => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/fees/discounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Discount deleted'); setDeleteTarget(null); invalidate() },
    onError: e => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<DiscountRow, unknown>[]>(() => [
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.student.firstName} {row.original.student.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.original.student.admissionNumber}</p>
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Discount',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate">{row.original.name}</p>
        </div>
      ),
    },
    {
      id: 'value',
      header: 'Amount',
      cell: ({ row }) => <span className="font-medium tabular-nums">{valueLabel(row.original)}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Granted',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{fmtDate(row.original.createdAt?.slice(0, 10))}</span>,
    },
    {
      id: 'active',
      header: 'Active',
      enableSorting: false,
      cell: ({ row }) => canWrite ? (
        <Switch
          checked={row.original.active}
          onCheckedChange={v => toggle.mutate({ id: row.original.id, active: v })}
          aria-label={`Toggle ${row.original.name}`}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="text-sm text-muted-foreground">{row.original.active ? 'Yes' : 'No'}</span>
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
  ], [canWrite, toggle])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> Grant discount</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={ToggleLeft}
          title="No discounts"
          description={canWrite
            ? 'Grant scholarships, staff-child waivers or sibling discounts to individual students.'
            : 'Discounts appear here once the bursar grants them.'}
          action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> Grant discount</Button> : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data.items}
          rowId={r => r.id}
          searchPlaceholder="Search discounts…"
          searchExtractor={r => `${r.student.firstName} ${r.student.lastName} ${r.name} ${r.student.admissionNumber}`}
          enableColumnToggle={false}
        />
      )}

      {canWrite && <CreateDiscountDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={invalidate} />}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        description="Existing invoices are not changed — the discount only affects future invoices."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </div>
  )
}

function CreateDiscountDialog({ open, onOpenChange, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [error, setError] = useState('')
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { studentId: '', name: '', type: 'PERCENT', value: 5 },
  })
  const type = form.watch('type')

  const { data: students } = useQuery({
    queryKey: ['students', 'options-all'],
    queryFn: () => api<{ items: StudentOption[] }>('/students?pageSize=500'),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: (values: Form) => api('/fees/discounts', {
      method: 'POST',
      body: {
        studentId: values.studentId,
        name: values.name,
        type: values.type,
        value: values.type === 'PERCENT' ? values.value : Math.round(values.value * 100),
        active: true,
      },
    }),
    onSuccess: () => {
      toast.success('Discount granted')
      onSaved()
      onOpenChange(false)
      form.reset()
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) setError('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant discount</DialogTitle>
          <DialogDescription>Percentage or fixed kobo waiver applied to future invoices.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(v => { setError(''); create.mutate(v) })}
        >
          <div className="space-y-1.5">
            <Label htmlFor="dc-student">Student</Label>
            <Select value={form.watch('studentId')} onValueChange={v => form.setValue('studentId', v, { shouldValidate: true })}>
              <SelectTrigger id="dc-student" aria-invalid={!!form.formState.errors.studentId}>
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {(students?.items ?? []).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.lastName} {s.firstName} ({s.admissionNumber})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.studentId && <p className="text-xs text-destructive">{form.formState.errors.studentId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dc-name">Name</Label>
            <Input id="dc-name" placeholder="e.g. Merit scholarship" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dc-type">Type</Label>
              <Select value={type} onValueChange={v => form.setValue('type', v as Form['type'])}>
                <SelectTrigger id="dc-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percent (%)</SelectItem>
                  <SelectItem value="FIXED">Fixed (₦)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc-value">{type === 'PERCENT' ? 'Percent' : 'Amount (₦)'}</Label>
              <Input id="dc-value" inputMode={type === 'PERCENT' ? 'numeric' : 'decimal'} {...form.register('value')} />
              {form.formState.errors.value && <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Grant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
