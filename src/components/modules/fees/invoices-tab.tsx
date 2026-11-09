'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Filter, Loader2, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira, nairaToKobo, koboToNaira } from '@/lib/money'
import { INVOICE_STATUSES } from '@/lib/validation/fees'
import { fmtDate } from '@/components/modules/academics/academic-helpers'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
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
import { InvoiceDetail } from './invoice-detail'
import { InvoiceStatusBadge } from './invoice-status-badge'

// ─── types ──────────────────────────────────────────────────────────────────
interface InvoiceRow {
  id: string
  invoiceNumber: string
  total: number
  amountPaid: number
  status: string
  dueDate: string
  createdAt: string
  student: {
    id: string; firstName: string; lastName: string; admissionNumber: string
    class: { id: string; name: string } | null
  }
  _count: { payments: number }
}

interface ListResp {
  items: InvoiceRow[]
  total: number
  pages: number
  counts: Record<string, number>
}

interface TermRow { id: string; name: string; sessionId: string; session?: { name: string } }
interface ClassRow { id: string; name: string; level: number }
interface StudentOption { id: string; firstName: string; lastName: string; admissionNumber: string; classId: string | null }
interface StructureRow { id: string; name: string; classId: string; termId: string; sessionId: string; totalAmount: number }

// ─── create form schema (naira input → kobo on submit) ─────────────────────
const createSchema = z.object({
  studentId: z.string().min(1, 'Select the student'),
  termId: z.string().min(1, 'Select the term'),
  dueDate: z.string().min(1, 'Pick the due date'),
  discountNaira: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
  notes: z.string().max(500).optional(),
})

type CreateForm = z.infer<typeof createSchema>

const emptyItem = { label: '', amountNaira: '' }

export function InvoicesTab({ canWrite, canPay: canPayTab }: { canWrite: boolean; canPay: boolean }) {
  const qc = useQueryClient()
  const isAdmin = useSession(s => s.role() === 'ADMIN')

  const [status, setStatus] = useState('')
  const [termFilter, setTermFilter] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<InvoiceRow | null>(null)

  const filters = useMemo(() => ({
    status: status || undefined,
    termId: termFilter || undefined,
    page,
    pageSize: 15,
  }), [status, termFilter, page])

  const { data, isLoading } = useQuery({
    queryKey: qk.invoices(filters),
    queryFn: () => api<ListResp>('/fees/invoices', { query: filters }),
  })

  const { data: terms } = useQuery({
    queryKey: qk.terms(),
    queryFn: () => api<{ items: (TermRow & { session?: { name: string } })[] }>('/academics/terms?pageSize=100'),
  })

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['fees'] })
    void qc.invalidateQueries({ queryKey: ['accounts'] })
    void qc.invalidateQueries({ queryKey: qk.dashboard })
  }

  const voidInvoice = useMutation({
    mutationFn: (id: string) => api(`/fees/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Invoice voided')
      invalidateAll()
      setVoidTarget(null)
    },
    onError: e => toast.error(e.message),
  })

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(() => [
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice',
      cell: ({ row }) => (
        <div>
          <p className="font-medium tabular-nums">{row.original.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">{row.original._count.payments} payment(s)</p>
        </div>
      ),
    },
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.student.firstName} {row.original.student.lastName}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.student.admissionNumber} · {row.original.student.class?.name ?? '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => <span className="tabular-nums">{formatNaira(row.original.total)}</span>,
    },
    {
      id: 'balance',
      header: 'Balance',
      cell: ({ row }) => {
        const bal = Math.max(0, row.original.total - row.original.amountPaid)
        return (
          <span className={bal > 0 ? 'tabular-nums text-destructive' : 'tabular-nums text-emerald-600 dark:text-emerald-400'}>
            {formatNaira(bal)}
          </span>
        )
      },
    },
    {
      accessorKey: 'dueDate',
      header: 'Due',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{fmtDate(row.original.dueDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          {canWrite && row.original.status !== 'VOID' && row.original.amountPaid === 0 && (
            <Button
              variant="ghost" size="icon" aria-label={`Void invoice ${row.original.invoiceNumber}`}
              onClick={e => { e.stopPropagation(); setVoidTarget(row.original) }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Select value={status} onValueChange={v => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[150px] pl-8" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Select value={termFilter} onValueChange={v => { setTermFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by term">
            <SelectValue placeholder="All terms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            {(terms?.items ?? []).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}{t.session?.name ? ` — ${t.session.name}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          {canWrite && (
            <>
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> Bulk generate
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New invoice
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No invoices found"
          description={canWrite
            ? 'Raise a single invoice or bulk-generate from a fee structure for the whole class.'
            : 'Invoices will appear here once the bursar raises them.'}
          action={canWrite ? (
            <div className="flex gap-2">
              <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> New invoice</Button>
              <Button variant="outline" onClick={() => setBulkOpen(true)}>Bulk generate</Button>
            </div>
          ) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data.items}
          rowId={r => r.id}
          searchPlaceholder="Search invoice, student…"
          searchExtractor={r => `${r.invoiceNumber} ${r.student.firstName} ${r.student.lastName} ${r.student.admissionNumber}`}
          enableColumnToggle={false}
          onRowClick={r => setDetailId(r.id)}
          toolbar={data.pages > 1 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span>Page {page} of {data.pages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          ) : undefined}
        />
      )}

      {canWrite && (
        <>
          <CreateInvoiceDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={invalidateAll}
            terms={terms?.items ?? []}
          />
          <BulkGenerateDialog
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onDone={invalidateAll}
          />
        </>
      )}

      <InvoiceDetail
        invoiceId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={invalidateAll}
        canWrite={canWrite || canPayTab}
        canPay={canPayTab}
      />

      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={o => { if (!o) setVoidTarget(null) }}
        title={`Void invoice ${voidTarget?.invoiceNumber ?? ''}?`}
        description="The invoice will be marked VOID and excluded from collection stats. This cannot be undone."
        confirmLabel="Void invoice"
        destructive
        onConfirm={async () => { if (voidTarget) await voidInvoice.mutateAsync(voidTarget.id) }}
      />
    </div>
  )
}

// ─── create invoice ─────────────────────────────────────────────────────────
export function CreateInvoiceDialog({ open, onOpenChange, onCreated, terms }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
  terms: (TermRow & { session?: { name: string } })[]
}) {
  const qc = useQueryClient()
  const [classId, setClassId] = useState('')
  const [items, setItems] = useState([{ ...emptyItem }])
  const [error, setError] = useState('')

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { studentId: '', termId: '', dueDate: '', discountNaira: 0, notes: '' },
  })

  const { data: classes } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes?pageSize=100'),
    enabled: open,
  })
  const { data: students } = useQuery({
    queryKey: ['students', 'options', classId],
    queryFn: () => api<{ items: StudentOption[] }>(`/students?pageSize=500${classId ? `&classId=${classId}` : ''}`),
    enabled: open,
  })

  const parsedItems = items
    .filter(i => i.label.trim() && Number(i.amountNaira) > 0)
    .map(i => ({ label: i.label.trim(), amount: nairaToKobo(Number(i.amountNaira.replace(/,/g, ''))) }))
  const subtotal = parsedItems.reduce((s, i) => s + i.amount, 0)
  const discount = Math.min(nairaToKobo(form.watch('discountNaira') || 0), subtotal)
  const total = Math.max(0, subtotal - discount)

  const create = useMutation({
    mutationFn: (values: CreateForm) => {
      const term = terms.find(t => t.id === values.termId)
      return api('/fees/invoices', {
        method: 'POST',
        body: {
          studentId: values.studentId,
          termId: values.termId,
          sessionId: term?.sessionId,
          items: parsedItems,
          discountAmount: discount,
          dueDate: values.dueDate,
          notes: values.notes,
        },
      })
    },
    onSuccess: () => {
      toast.success('Invoice raised')
      onCreated()
      void qc.invalidateQueries()
      onOpenChange(false)
      form.reset()
      setItems([{ ...emptyItem }])
      setClassId('')
      setError('')
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) setError('') }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Line items are billed in naira and stored in kobo.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(v => {
            if (parsedItems.length === 0) { setError('Add at least one complete line item'); return }
            setError('')
            create.mutate(v)
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-class">Filter students by class</Label>
              <Select value={classId} onValueChange={v => { setClassId(v === 'all' ? '' : v); form.setValue('studentId', '') }}>
                <SelectTrigger id="inv-class"><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(classes?.items ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-student">Student</Label>
              <Select value={form.watch('studentId')} onValueChange={v => form.setValue('studentId', v, { shouldValidate: true })}>
                <SelectTrigger id="inv-student" aria-invalid={!!form.formState.errors.studentId}>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-term">Term</Label>
              <Select value={form.watch('termId')} onValueChange={v => form.setValue('termId', v, { shouldValidate: true })}>
                <SelectTrigger id="inv-term" aria-invalid={!!form.formState.errors.termId}>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {(terms ?? []).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.session?.name ? ` — ${t.session.name}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.termId && <p className="text-xs text-destructive">{form.formState.errors.termId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-due">Due date</Label>
              <Input id="inv-due" type="date" {...form.register('dueDate')} />
              {form.formState.errors.dueDate && <p className="text-xs text-destructive">{form.formState.errors.dueDate.message}</p>}
            </div>
          </div>

          {/* line items */}
          <div className="space-y-2">
            <Label>Line items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="e.g. Tuition"
                  value={item.label}
                  onChange={e => setItems(arr => arr.map((it, i) => i === idx ? { ...it, label: e.target.value } : it))}
                  aria-label={`Item ${idx + 1} label`}
                />
                <Input
                  className="w-36" inputMode="decimal" placeholder="₦0"
                  value={item.amountNaira}
                  onChange={e => setItems(arr => arr.map((it, i) => i === idx ? { ...it, amountNaira: e.target.value } : it))}
                  aria-label={`Item ${idx + 1} amount in naira`}
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-discount">Discount (₦)</Label>
              <Input id="inv-discount" inputMode="decimal" {...form.register('discountNaira')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Notes</Label>
              <Input id="inv-notes" placeholder="Optional" {...form.register('notes')} />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatNaira(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{formatNaira(discount)}</span></div>
            <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold"><span>Total</span><span className="tabular-nums">{formatNaira(total)}</span></div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Raise invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── bulk generate ──────────────────────────────────────────────────────────
function BulkGenerateDialog({ open, onOpenChange, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [structureId, setStructureId] = useState('')
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const { data: structures } = useQuery({
    queryKey: qk.feeStructures({ active: true }),
    queryFn: () => api<{ items: StructureRow[] }>('/fees/structures?pageSize=200&isActive=true'),
    enabled: open,
  })
  const structure = structures?.items.find(s => s.id === structureId)

  const { data: classes } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes?pageSize=100'),
    enabled: open,
  })
  const { data: sections } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/academics/sections?classId=${classId}`),
    enabled: open && !!classId,
  })

  const generate = useMutation({
    mutationFn: () => api<{ created: number; skipped: number; message?: string }>('/fees/invoices/bulk', {
      method: 'POST',
      body: {
        feeStructureId: structureId,
        classId,
        sectionId: sectionId || undefined,
        dueDate,
        skipExisting: true,
      },
    }),
    onSuccess: res => {
      if (res.message) {
        setError(res.message)
        setResult(null)
        return
      }
      setResult(res)
      setError('')
      onDone()
    },
    onError: e => { setError(e.message); setResult(null) },
  })

  const selectedClass = classes?.items.find(c => c.id === (structure?.classId ?? classId))

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) { setError(''); setResult(null) } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk generate invoices</DialogTitle>
          <DialogDescription>
            Raise one invoice per active student from a fee structure. Students who already have an invoice for that term are skipped.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <Sparkles className="h-6 w-6 text-emerald-600" aria-hidden />
            </div>
            <p className="text-sm">
              Generated <strong>{result.created}</strong> invoice{result.created === 1 ? '' : 's'}
              {result.skipped > 0 && <> · skipped <strong>{result.skipped}</strong> (already invoiced)</>}
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => { setResult(null); onOpenChange(false) }}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!structureId || !dueDate) { setError('Pick a fee structure and due date'); return }
              if (!structure) { setError('Pick a fee structure'); return }
              setError('')
              generate.mutate()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="bulk-structure">Fee structure</Label>
              <Select value={structureId} onValueChange={v => {
                setStructureId(v)
                const s = structures?.items.find(x => x.id === v)
                if (s) { setClassId(s.classId); setSectionId('') }
              }}>
                <SelectTrigger id="bulk-structure"><SelectValue placeholder="Select fee structure" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(structures?.items ?? []).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {formatNaira(s.totalAmount)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {structure && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p className="font-medium">{selectedClass?.name ?? 'Class'} · term invoices</p>
                <p className="text-muted-foreground">Amount per student: {formatNaira(structure.totalAmount)}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-class">Class</Label>
                <Select value={classId} onValueChange={v => { setClassId(v === 'all' ? '' : v); setSectionId('') }} disabled={!!structure}>
                  <SelectTrigger id="bulk-class"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {(classes?.items ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-section">Section (optional)</Label>
                <Select value={sectionId} onValueChange={v => setSectionId(v === 'all' ? '' : v)}>
                  <SelectTrigger id="bulk-section"><SelectValue placeholder="Whole class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Whole class</SelectItem>
                    {(sections?.items ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-due">Due date</Label>
              <Input id="bulk-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={generate.isPending || !structureId}>
                {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Generate
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
