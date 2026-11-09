'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowDownRight, ArrowUpRight, Loader2, Lock, NotebookText, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { formatNaira, nairaToKobo } from '@/lib/money'
import { LEDGER_CATEGORIES, LEDGER_TYPES } from '@/lib/validation/fees'
import { fmtDate } from '@/components/modules/academics/academic-helpers'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatCard } from '@/components/shared/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface LedgerRow {
  id: string
  type: 'INCOME' | 'EXPENSE'
  category: string
  description: string
  amount: number
  date: string
  source: string
}

interface ListResp {
  items: LedgerRow[]
  total: number
  pages: number
  totals: { income: number; expense: number; net: number }
}

const CATEGORY_LABEL: Record<string, string> = {
  TUITION: 'Tuition', OTHER_INCOME: 'Other income', SALARIES: 'Salaries',
  UTILITIES: 'Utilities', MAINTENANCE: 'Maintenance', SUPPLIES: 'Supplies',
  TRANSPORT: 'Transport', EVENTS: 'Events', TAXES: 'Taxes', OTHER: 'Other',
}

const schema = z.object({
  type: z.enum(LEDGER_TYPES),
  category: z.enum(LEDGER_CATEGORIES),
  description: z.string().min(2, 'Description is required').max(300),
  amountNaira: z.coerce.number().positive('Enter the amount'),
  date: z.string().min(1, 'Pick the date'),
})

type Form = z.infer<typeof schema>

export function LedgerTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LedgerRow | null>(null)

  const filters = useMemo(() => ({
    type: type || undefined,
    category: category || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 20,
  }), [type, category, from, to, page])

  const { data, isLoading } = useQuery({
    queryKey: qk.ledger(filters),
    queryFn: () => api<ListResp>('/accounts/ledger', { query: filters }),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounts'] })
    void qc.invalidateQueries({ queryKey: qk.dashboard })
  }

  const remove = useMutation({
    mutationFn: (id: string) => api(`/accounts/ledger/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Entry deleted'); setDeleteTarget(null); invalidate() },
    onError: e => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<LedgerRow, unknown>[]>(() => [
    {
      id: 'entry',
      header: 'Description',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            row.original.type === 'INCOME'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}>
            {row.original.type === 'INCOME'
              ? <ArrowUpRight className="h-4 w-4" aria-hidden />
              : <ArrowDownRight className="h-4 w-4" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.description}</p>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABEL[row.original.category] ?? row.original.category}
              {row.original.source !== 'MANUAL' && ` · auto (${row.original.source})`}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{fmtDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className={`tabular-nums font-medium ${
          row.original.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
        }`}>
          {row.original.type === 'INCOME' ? '+' : '−'}{formatNaira(row.original.amount)}
        </span>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">{row.original.source}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          {canWrite && row.original.source === 'MANUAL' && (
            <Button
              variant="ghost" size="icon" aria-label={`Delete ${row.original.description}`}
              onClick={e => { e.stopPropagation(); setDeleteTarget(row.original) }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          )}
          {canWrite && row.original.source !== 'MANUAL' && (
            <span className="pr-2 text-muted-foreground" title="System-generated entries are locked">
              <Lock className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </div>
      ),
    },
  ], [canWrite])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        <StatCard label="Income (filtered)" icon={ArrowUpRight} tone="success" loading={isLoading}
          value={formatNaira(data?.totals.income ?? 0, { compact: true })} />
        <StatCard label="Expense (filtered)" icon={ArrowDownRight} tone="destructive" loading={isLoading}
          value={formatNaira(data?.totals.expense ?? 0, { compact: true })} />
        <StatCard label="Net position" icon={NotebookText} loading={isLoading}
          tone={(data?.totals.net ?? 0) >= 0 ? 'primary' : 'destructive'}
          value={formatNaira(data?.totals.net ?? 0, { compact: true })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={v => { setType(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[140px]" aria-label="Filter by type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {LEDGER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={v => { setCategory(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {LEDGER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="w-[150px]" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} aria-label="From date" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" className="w-[150px]" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} aria-label="To date" />
        </div>
        {canWrite && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add entry
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={NotebookText}
          title="No ledger entries"
          description={canWrite
            ? 'Fee payments land here automatically. Add manual expenses like utilities, maintenance or supplies.'
            : 'Transactions will appear here as fees are collected and expenses recorded.'}
          action={canWrite ? <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add entry</Button> : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data.items}
          rowId={r => r.id}
          searchPlaceholder="Search description…"
          searchExtractor={r => `${r.description} ${r.category}`}
          enableColumnToggle={false}
          toolbar={data.pages > 1 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span>Page {page} of {data.pages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          ) : undefined}
        />
      )}

      {canWrite && <LedgerEntryDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={invalidate} />}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.description ?? ''}"?`}
        description={`This removes ${deleteTarget ? formatNaira(deleteTarget.amount) : 'the entry'} from the ledger permanently.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </div>
  )
}

function LedgerEntryDialog({ open, onOpenChange, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [error, setError] = useState('')
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'EXPENSE', category: 'UTILITIES', description: '', amountNaira: undefined as never, date: new Date().toISOString().slice(0, 10) },
  })

  const create = useMutation({
    mutationFn: (v: Form) => api('/accounts/ledger', {
      method: 'POST',
      body: {
        type: v.type,
        category: v.category,
        description: v.description,
        amount: nairaToKobo(v.amountNaira),
        date: v.date,
      },
    }),
    onSuccess: () => {
      toast.success('Ledger entry added')
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
          <DialogTitle>Add ledger entry</DialogTitle>
          <DialogDescription>Manual income or expense. Fee payments are recorded automatically.</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(v => { setError(''); create.mutate(v) })}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="le-type">Type</Label>
              <Select value={form.watch('type')} onValueChange={v => form.setValue('type', v as Form['type'])}>
                <SelectTrigger id="le-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Income</SelectItem>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="le-cat">Category</Label>
              <Select value={form.watch('category')} onValueChange={v => form.setValue('category', v as Form['category'])}>
                <SelectTrigger id="le-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEDGER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="le-desc">Description</Label>
            <Input id="le-desc" placeholder="e.g. Generator diesel refill" {...form.register('description')} />
            {form.formState.errors.description && <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="le-amount">Amount (₦)</Label>
              <Input id="le-amount" inputMode="decimal" placeholder="0" {...form.register('amountNaira')} />
              {form.formState.errors.amountNaira && <p className="text-xs text-destructive">{form.formState.errors.amountNaira.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="le-date">Date</Label>
              <Input id="le-date" type="date" {...form.register('date')} />
              {form.formState.errors.date && <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Add entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
