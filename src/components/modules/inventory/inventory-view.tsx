'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, Loader2, PackageMinus, Pencil, Plus,
  SlidersHorizontal, Trash2, TriangleAlert, Truck,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  ITEM_CATEGORY_SUGGESTIONS, ITEM_UNITS, MOVEMENT_REASON_SUGGESTIONS,
  MOVEMENT_TYPE_LABEL, MOVEMENT_TYPES,
} from '@/lib/domain/inventory'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { StatCard } from '@/components/shared/stat-card'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'

// ── Row shapes ──────────────────────────────────────────────────────────────

interface ItemRow {
  id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  stockQty: number
  reorderLevel: number
  unitPrice: number | null
  description: string | null
  lowStock: boolean
}

interface MovementRow {
  id: string
  itemId: string
  itemName: string
  unit: string
  type: string // IN | OUT | ADJUST
  quantity: number
  unitCost: number | null
  reason: string | null
  reference: string | null
  supplierName: string | null
  date: string
  createdAt: string
}

interface SupplierRow {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

interface ItemsPayload {
  items: ItemRow[]
  total: number
  stats: { total: number; lowStock: number; stockValue: number }
}

const today = () => new Date().toISOString().slice(0, 10)

const prettyDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const MOVEMENT_BADGE: Record<string, string> = {
  IN: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  OUT: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  ADJUST: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

// ── Page ────────────────────────────────────────────────────────────────────

export function InventoryView() {
  const canWrite = useSession(s => s.can('inventory.write'))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Inventory"
        description="Track school stock — stationery, uniforms, supplies — with movements and re-order alerts."
      />
      <Tabs defaultValue="items" className="gap-4">
        <TabsList>
          <TabsTrigger value="items" className="gap-1.5"><Boxes className="h-4 w-4" /> Items</TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5"><ArrowUpFromLine className="h-4 w-4" /> Movements</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="h-4 w-4" /> Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-2"><ItemsTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="movements" className="mt-2"><MovementsTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="suppliers" className="mt-2"><SuppliersTab canWrite={canWrite} /></TabsContent>
      </Tabs>
    </motion.div>
  )
}

// ── Items tab ───────────────────────────────────────────────────────────────

function ItemsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [category, setCategory] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [deleting, setDeleting] = useState<ItemRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.inventoryItems({ category }),
    queryFn: () => api<ItemsPayload>('/inventory/items', { query: { category: category === 'all' ? undefined : category, pageSize: 200 } }),
  })
  const rows = data?.items ?? []
  const stats = data?.stats
  const categories = useMemo(
    () => [...new Set(rows.map(r => r.category).filter(Boolean))].sort() as string[],
    [rows],
  )

  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Item',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.sku ?? row.original.category ?? '—'}</p>
        </div>
      ),
    },
    { accessorKey: 'category', header: 'Category', cell: ({ row }) => row.original.category ?? '—' },
    {
      accessorKey: 'stockQty',
      header: 'In stock',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{row.original.stockQty}</span>
          <span className="text-xs text-muted-foreground">{row.original.unit}</span>
          {row.original.lowStock && (
            <Badge variant="outline" className="gap-1 border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3" aria-hidden /> Low
            </Badge>
          )}
        </div>
      ),
    },
    { accessorKey: 'reorderLevel', header: 'Re-order at', cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.reorderLevel}</span> },
    { accessorKey: 'unitPrice', header: 'Unit price', cell: ({ row }) => <span className="tabular-nums">{row.original.unitPrice != null ? formatNaira(row.original.unitPrice) : '—'}</span> },
    {
      id: 'value',
      header: 'Stock value',
      cell: ({ row }) => <span className="tabular-nums">{row.original.unitPrice != null ? formatNaira(row.original.stockQty * row.original.unitPrice) : '—'}</span>,
    },
    ...(canWrite ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }: { row: { original: ItemRow } }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${row.original.name}`} onClick={() => setDeleting(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    } as ColumnDef<ItemRow, unknown>] : []),
  ], [canWrite])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Items tracked" value={stats?.total ?? 0} icon={Boxes} loading={isLoading} />
        <StatCard label="Stock value" value={stats ? formatNaira(stats.stockValue, { compact: true }) : '—'} icon={ArrowDownToLine} tone="primary" loading={isLoading} hint="At last unit prices" />
        <StatCard label="Low stock" value={stats?.lowStock ?? 0} icon={TriangleAlert} tone={stats?.lowStock ? 'warning' : 'default'} loading={isLoading} hint="At or below re-order level" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search items…"
        searchExtractor={r => `${r.name} ${r.sku ?? ''} ${r.category ?? ''}`}
        initialPageSize={10}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-44" aria-label="Filter by category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {[...new Set([...categories, ...ITEM_CATEGORY_SUGGESTIONS])].sort().map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
                <Plus className="h-4 w-4" /> Add item
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={Boxes}
            title="No stock items yet"
            description="Register the items your school keeps — chalk, exercise books, uniforms — then record stock in/out as they move."
            action={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add item</Button> : undefined}
          />
        }
      />

      <ItemDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="The item and its movement history will be removed. This cannot be undone."
        confirmLabel="Delete item"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await api(`/inventory/items/${deleting.id}`, { method: 'DELETE' })
          toast.success('Item deleted')
          void qc.invalidateQueries({ queryKey: ['inventory'] })
        }}
      />
    </div>
  )
}

function ItemDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ItemRow | null
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [sku, setSku] = useState(editing?.sku ?? '')
  const [category, setCategory] = useState(editing?.category ?? '')
  const [unit, setUnit] = useState(editing?.unit ?? 'pcs')
  const [reorderLevel, setReorderLevel] = useState(String(editing?.reorderLevel ?? 5))
  const [price, setPrice] = useState(editing?.unitPrice != null ? String(editing.unitPrice / 100) : '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        category: category.trim() || undefined,
        unit,
        reorderLevel: Math.max(0, Math.round(Number(reorderLevel) || 0)),
        unitPrice: price.trim() ? Math.round(Number(price.replace(/,/g, '')) * 100) : null,
        description: description.trim() || undefined,
      }
      return editing
        ? api(`/inventory/items/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/inventory/items', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success(editing ? 'Item updated' : 'Item added to the catalogue')
      onOpenChange(false)
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit item' : 'New stock item'}</DialogTitle>
          <DialogDescription>Re-order alerts fire when stock reaches the re-order level.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="inv-name">Item name *</Label>
            <Input id="inv-name" value={name} onChange={e => { setName(e.target.value); setError(undefined) }} placeholder="e.g. Chalk (box)" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="inv-sku">SKU / code</Label>
              <Input id="inv-sku" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. STN-001" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-category">Category</Label>
              <Input id="inv-category" list="inv-cat-list" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Stationery" />
              <datalist id="inv-cat-list">{ITEM_CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="inv-unit">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="inv-unit"><SelectValue /></SelectTrigger>
                <SelectContent>{ITEM_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-reorder">Re-order at</Label>
              <Input id="inv-reorder" type="number" min={0} value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-price">Unit price (₦)</Label>
              <Input id="inv-price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 850" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-desc">Notes</Label>
            <Textarea id="inv-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional description…" />
          </div>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Movements tab ───────────────────────────────────────────────────────────

function MovementsTab({ canWrite }: { canWrite: boolean }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: qk.inventoryMovements({ type: typeFilter }),
    queryFn: () => api<{ items: MovementRow[]; total: number }>('/inventory/movements', {
      query: { type: typeFilter === 'all' ? undefined : typeFilter, pageSize: 50 },
    }),
  })
  const rows = data?.items ?? []

  const columns = useMemo<ColumnDef<MovementRow, unknown>[]>(() => [
    { accessorKey: 'date', header: 'Date', cell: ({ row }) => prettyDate(row.original.date) },
    { accessorKey: 'itemName', header: 'Item', cell: ({ row }) => <span className="font-medium">{row.original.itemName}</span> },
    {
      accessorKey: 'type',
      header: 'Movement',
      cell: ({ row }) => {
        const t = row.original.type
        const arrow = t === 'IN' ? <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> : t === 'OUT' ? <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden /> : <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        return (
          <Badge variant="outline" className={cn('gap-1 border-transparent', MOVEMENT_BADGE[t])}>
            {arrow} {MOVEMENT_TYPE_LABEL[t] ?? t}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      cell: ({ row }) => (
        <span className={cn('font-semibold tabular-nums', row.original.type === 'OUT' && 'text-rose-600 dark:text-rose-400')}>
          {row.original.type === 'IN' ? '+' : row.original.type === 'OUT' ? '−' : '= '}{row.original.quantity} {row.original.unit}
        </span>
      ),
    },
    { accessorKey: 'unitCost', header: 'Unit cost', cell: ({ row }) => <span className="tabular-nums">{row.original.unitCost != null ? formatNaira(row.original.unitCost) : '—'}</span> },
    {
      id: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.reason ?? '—'}</p>
          {row.original.supplierName && <p className="truncate text-xs text-muted-foreground">via {row.original.supplierName}</p>}
        </div>
      ),
    },
  ], [])

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search movements…"
        searchExtractor={r => `${r.itemName} ${r.reason ?? ''} ${r.supplierName ?? ''}`}
        initialPageSize={15}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-40" aria-label="Filter by movement type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All movements</SelectItem>
                {MOVEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{MOVEMENT_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> Record movement
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={ArrowUpFromLine}
            title="No stock movements yet"
            description="Every stock-in, issue and stock-take lands here with a full audit trail."
            action={canWrite ? <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Record movement</Button> : undefined}
          />
        }
      />
      <MovementDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function MovementDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [itemId, setItemId] = useState('')
  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUST'>('IN')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [supplierId, setSupplierId] = useState('none')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | undefined>()

  const { data: itemsData } = useQuery({
    queryKey: qk.inventoryItems({}),
    queryFn: () => api<ItemsPayload>('/inventory/items', { query: { pageSize: 200 } }),
    enabled: open,
  })
  const { data: suppliersData } = useQuery({
    queryKey: qk.suppliers({}),
    queryFn: () => api<{ items: SupplierRow[] }>('/inventory/suppliers', { query: { pageSize: 100 } }),
    enabled: open,
  })
  const items = itemsData?.items ?? []
  const selectedItem = items.find(i => i.id === itemId)
  const reasons = MOVEMENT_REASON_SUGGESTIONS[type]

  const save = useMutation({
    mutationFn: () => api('/inventory/movements', {
      method: 'POST',
      body: {
        itemId,
        type,
        quantity: Math.round(Number(quantity) || 0),
        unitCost: type === 'IN' && unitCost.trim() ? Math.round(Number(unitCost.replace(/,/g, '')) * 100) : null,
        supplierId: type === 'IN' && supplierId !== 'none' ? supplierId : null,
        reason: reason.trim() || undefined,
        reference: reference.trim() || undefined,
        date,
      },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: qk.notifications })
      toast.success('Stock movement recorded')
      onOpenChange(false)
      setItemId(''); setQuantity(''); setUnitCost(''); setReason(''); setReference(''); setSupplierId('none')
    },
    onError: e => setError(e.message),
  })

  const qtyNum = Math.round(Number(quantity) || 0)
  const valid = !!itemId && qtyNum > 0 && date.length === 10
    && !(type === 'OUT' && selectedItem && qtyNum > selectedItem.stockQty)
    && !(type === 'ADJUST' && selectedItem && qtyNum === selectedItem.stockQty)

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record stock movement</DialogTitle>
          <DialogDescription>Stock in adds, issue-out subtracts, and stock-take sets the counted level.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="mv-item">Item *</Label>
            <Select value={itemId} onValueChange={v => { setItemId(v); setError(undefined) }}>
              <SelectTrigger id="mv-item"><SelectValue placeholder="Pick an item" /></SelectTrigger>
              <SelectContent>
                {items.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} — {i.stockQty} {i.unit} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedItem && selectedItem.lowStock && (
              <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3 w-3" aria-hidden /> Already at/below re-order level ({selectedItem.reorderLevel})
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Movement type">
            {MOVEMENT_TYPES.map(t => {
              const Icon = t === 'IN' ? ArrowDownToLine : t === 'OUT' ? PackageMinus : SlidersHorizontal
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setReason(''); setError(undefined) }}
                  className={cn(
                    'flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors',
                    type === t ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted/50',
                  )}
                  aria-pressed={type === t}
                >
                  <Icon className="h-4 w-4" aria-hidden /> {MOVEMENT_TYPE_LABEL[t]}
                </button>
              )
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mv-qty">{type === 'ADJUST' ? 'Counted quantity *' : 'Quantity *'}</Label>
              <Input id="mv-qty" type="number" min={0} value={quantity} onChange={e => { setQuantity(e.target.value); setError(undefined) }} placeholder={type === 'ADJUST' ? 'New total from stock-take' : 'How many?'} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mv-date">Date *</Label>
              <Input id="mv-date" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          {type === 'IN' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="mv-cost">Unit cost (₦)</Label>
                <Input id="mv-cost" inputMode="decimal" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="e.g. 850" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mv-supplier">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="mv-supplier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier</SelectItem>
                    {(suppliersData?.items ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="mv-reason">Reason</Label>
            <Input id="mv-reason" list="mv-reason-list" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Purchase" />
            <datalist id="mv-reason-list">{reasons.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mv-ref">Reference</Label>
            <Input id="mv-ref" value={reference} onChange={e => setReference(e.target.value)} placeholder="Receipt / waybill no. (optional)" />
          </div>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !valid}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Suppliers tab ───────────────────────────────────────────────────────────

function SuppliersTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [deleting, setDeleting] = useState<SupplierRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.suppliers({}),
    queryFn: () => api<{ items: SupplierRow[]; total: number }>('/inventory/suppliers', { query: { pageSize: 100 } }),
  })
  const rows = data?.items ?? []

  const columns = useMemo<ColumnDef<SupplierRow, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Supplier',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          {row.original.contactName && <p className="truncate text-xs text-muted-foreground">Attn: {row.original.contactName}</p>}
        </div>
      ),
    },
    { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone ?? '—' },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
    { accessorKey: 'address', header: 'Address', cell: ({ row }) => <span className="line-clamp-2 max-w-56 text-sm text-muted-foreground">{row.original.address ?? '—'}</span> },
    ...(canWrite ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }: { row: { original: SupplierRow } }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${row.original.name}`} onClick={() => setDeleting(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    } as ColumnDef<SupplierRow, unknown>] : []),
  ], [canWrite])

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search suppliers…"
        searchExtractor={r => `${r.name} ${r.contactName ?? ''} ${r.phone ?? ''}`}
        initialPageSize={10}
        toolbar={canWrite ? (
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add supplier</Button>
        ) : undefined}
        emptyState={
          <EmptyState
            icon={Truck}
            title="No suppliers yet"
            description="Keep your vendors here so stock-in records can reference them."
            action={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add supplier</Button> : undefined}
          />
        }
      />
      <SupplierDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Past stock movements keep their records; the supplier entry itself will be removed."
        confirmLabel="Delete supplier"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await api(`/inventory/suppliers/${deleting.id}`, { method: 'DELETE' })
          toast.success('Supplier deleted')
          void qc.invalidateQueries({ queryKey: ['inventory'] })
        }}
      />
    </div>
  )
}

function SupplierDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: SupplierRow | null
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [contactName, setContactName] = useState(editing?.contactName ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      }
      return editing
        ? api(`/inventory/suppliers/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/inventory/suppliers', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success(editing ? 'Supplier updated' : 'Supplier added')
      onOpenChange(false)
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit supplier' : 'New supplier'}</DialogTitle>
          <DialogDescription>Vendors you buy stock from.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sup-name">Supplier name *</Label>
            <Input id="sup-name" value={name} onChange={e => { setName(e.target.value); setError(undefined) }} placeholder="e.g. Lagos Books & Supplies Ltd" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input id="sup-contact" value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input id="sup-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0803…" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sup-email">Email</Label>
            <Input id="sup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sup-address">Address</Label>
            <Textarea id="sup-address" value={address} onChange={e => setAddress(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sup-notes">Notes</Label>
            <Textarea id="sup-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, delivery days…" />
          </div>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Add supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
