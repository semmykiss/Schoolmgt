'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpen, BookMarked, Loader2, Library as LibraryIcon, Pencil, Plus,
  RotateCcw, Trash2, TriangleAlert, UserRound,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BOOK_CATEGORY_SUGGESTIONS, defaultLoanDueDate, LIBRARY_FINE_PER_DAY } from '@/lib/domain/inventory'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

interface BookRow {
  id: string
  title: string
  author: string | null
  isbn: string | null
  category: string | null
  shelf: string | null
  totalCopies: number
  availableCopies: number
}

interface LoanRow {
  id: string
  bookId: string
  bookTitle: string
  shelf: string | null
  borrowerType: string // STUDENT | EMPLOYEE
  borrowerName: string
  borrowedAt: string
  dueDate: string
  returnedAt: string | null
  fineAmount: number
  status: string // ISSUED | RETURNED | OVERDUE
  daysOverdue: number
}

interface BooksPayload {
  items: BookRow[]
  total: number
  stats: { titles: number; copies: number; available: number }
}

const today = () => new Date().toISOString().slice(0, 10)

const prettyDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const LOAN_BADGE: Record<string, string> = {
  ISSUED: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  OVERDUE: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  RETURNED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

// ── Page ────────────────────────────────────────────────────────────────────

export function LibraryView() {
  const canWrite = useSession(s => s.can('library.write'))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Library"
        description="Book catalogue, issuing and returns — with automatic overdue fines (₦50/day)."
      />
      <Tabs defaultValue="catalogue" className="gap-4">
        <TabsList>
          <TabsTrigger value="catalogue" className="gap-1.5"><BookOpen className="h-4 w-4" /> Catalogue</TabsTrigger>
          <TabsTrigger value="loans" className="gap-1.5"><BookMarked className="h-4 w-4" /> Issued books</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogue" className="mt-2"><CatalogueTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="loans" className="mt-2"><LoansTab canWrite={canWrite} /></TabsContent>
      </Tabs>
    </motion.div>
  )
}

// ── Catalogue tab ───────────────────────────────────────────────────────────

function CatalogueTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BookRow | null>(null)
  const [deleting, setDeleting] = useState<BookRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.books({ available: onlyAvailable }),
    queryFn: () => api<BooksPayload>('/library/books', { query: { available: onlyAvailable ? '1' : undefined, pageSize: 200 } }),
  })
  const rows = data?.items ?? []
  const stats = data?.stats

  const columns = useMemo<ColumnDef<BookRow, unknown>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Book',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.title}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.author ?? '—'}</p>
        </div>
      ),
    },
    { accessorKey: 'category', header: 'Category', cell: ({ row }) => row.original.category ?? '—' },
    { accessorKey: 'shelf', header: 'Shelf', cell: ({ row }) => row.original.shelf ?? '—' },
    { accessorKey: 'isbn', header: 'ISBN', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.isbn ?? '—'}</span> },
    {
      accessorKey: 'availableCopies',
      header: 'Available',
      cell: ({ row }) => {
        const { availableCopies: a, totalCopies: t } = row.original
        const out = t - a
        return (
          <div className="flex items-center gap-2">
            <span className={cn('font-semibold tabular-nums', a === 0 && 'text-rose-600 dark:text-rose-400')}>{a}</span>
            <span className="text-xs text-muted-foreground">of {t}</span>
            {a === 0 ? (
              <Badge variant="outline" className="border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400">All out</Badge>
            ) : out > 0 ? (
              <span className="text-xs text-muted-foreground">· {out} out</span>
            ) : null}
          </div>
        )
      },
    },
    ...(canWrite ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }: { row: { original: BookRow } }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${row.original.title}`} onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${row.original.title}`} onClick={() => setDeleting(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    } as ColumnDef<BookRow, unknown>] : []),
  ], [canWrite])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Titles catalogued" value={stats?.titles ?? 0} icon={BookOpen} loading={isLoading} />
        <StatCard label="Total copies" value={stats?.copies ?? 0} icon={LibraryIcon} tone="primary" loading={isLoading} />
        <StatCard label="On the shelf" value={stats?.available ?? 0} icon={BookMarked} tone="success" loading={isLoading} hint="Available to issue" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search title, author or ISBN…"
        searchExtractor={r => `${r.title} ${r.author ?? ''} ${r.isbn ?? ''}`}
        initialPageSize={10}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={onlyAvailable ? 'default' : 'outline'}
              size="sm"
              className="h-9"
              aria-pressed={onlyAvailable}
              onClick={() => setOnlyAvailable(v => !v)}
            >
              <BookMarked className="h-4 w-4" /> Available only
            </Button>
            {canWrite && (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
                <Plus className="h-4 w-4" /> Add book
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={BookOpen}
            title="No books catalogued"
            description="Add the books in your library so they can be issued to students and staff."
            action={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="h-4 w-4" /> Add book</Button> : undefined}
          />
        }
      />

      <BookDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Remove "${deleting?.title}"?`}
        description="The catalogue entry will be deleted. Books still out with borrowers must be received back first."
        confirmLabel="Remove book"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await api(`/library/books/${deleting.id}`, { method: 'DELETE' })
          toast.success('Book removed from the catalogue')
          void qc.invalidateQueries({ queryKey: ['library'] })
        }}
      />
    </div>
  )
}

function BookDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: BookRow | null
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [author, setAuthor] = useState(editing?.author ?? '')
  const [isbn, setIsbn] = useState(editing?.isbn ?? '')
  const [category, setCategory] = useState(editing?.category ?? '')
  const [shelf, setShelf] = useState(editing?.shelf ?? '')
  const [totalCopies, setTotalCopies] = useState(String(editing?.totalCopies ?? 1))
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        category: category.trim() || undefined,
        shelf: shelf.trim() || undefined,
        totalCopies: Math.max(1, Math.round(Number(totalCopies) || 1)),
      }
      return editing
        ? api(`/library/books/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/library/books', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] })
      toast.success(editing ? 'Book updated' : 'Book added to the catalogue')
      onOpenChange(false)
    },
    onError: e => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit book' : 'New book'}</DialogTitle>
          <DialogDescription>Growing the copy count makes the extra copies available to issue.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bk-title">Title *</Label>
            <Input id="bk-title" value={title} onChange={e => { setTitle(e.target.value); setError(undefined) }} placeholder="e.g. New General Mathematics JSS 1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-author">Author</Label>
              <Input id="bk-author" value={author} onChange={e => setAuthor(e.target.value)} placeholder="e.g. M.F. Macrae" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-isbn">ISBN</Label>
              <Input id="bk-isbn" value={isbn} onChange={e => setIsbn(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-category">Category</Label>
              <Input id="bk-category" list="bk-cat-list" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Textbook" />
              <datalist id="bk-cat-list">{BOOK_CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-shelf">Shelf</Label>
              <Input id="bk-shelf" value={shelf} onChange={e => setShelf(e.target.value)} placeholder="e.g. A-12" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-copies">Copies</Label>
              <Input id="bk-copies" type="number" min={1} value={totalCopies} onChange={e => setTotalCopies(e.target.value)} />
            </div>
          </div>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || title.trim().length < 2}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Add book'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Issued books tab ────────────────────────────────────────────────────────

function LoansTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [issueOpen, setIssueOpen] = useState(false)
  const [returning, setReturning] = useState<LoanRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.loans({ status: statusFilter }),
    queryFn: () => api<{ items: LoanRow[]; total: number }>('/library/loans', {
      query: { status: statusFilter === 'all' ? undefined : statusFilter, pageSize: 50 },
    }),
  })
  const rows = data?.items ?? []
  const outCount = rows.filter(r => r.status !== 'RETURNED').length
  const overdueCount = rows.filter(r => r.status === 'OVERDUE').length

  const columns = useMemo<ColumnDef<LoanRow, unknown>[]>(() => [
    {
      accessorKey: 'bookTitle',
      header: 'Book',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.bookTitle}</p>
          {row.original.shelf && <p className="truncate text-xs text-muted-foreground">Shelf {row.original.shelf}</p>}
        </div>
      ),
    },
    {
      id: 'borrower',
      header: 'Borrower',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.borrowerName}</p>
            <p className="text-xs text-muted-foreground">{row.original.borrowerType === 'STUDENT' ? 'Student' : 'Staff'}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: 'borrowedAt', header: 'Issued', cell: ({ row }) => prettyDate(row.original.borrowedAt) },
    {
      accessorKey: 'dueDate',
      header: 'Due',
      cell: ({ row }) => {
        const overdue = row.original.status === 'OVERDUE'
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn(overdue && 'font-medium text-rose-600 dark:text-rose-400')}>{prettyDate(row.original.dueDate)}</span>
            {overdue && row.original.daysOverdue > 0 && (
              <Badge variant="outline" className="gap-1 border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <TriangleAlert className="h-3 w-3" aria-hidden /> {row.original.daysOverdue}d late
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={cn('border-transparent', LOAN_BADGE[row.original.status] ?? 'bg-muted text-muted-foreground')}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'fineAmount',
      header: 'Fine',
      cell: ({ row }) => (row.original.fineAmount > 0
        ? <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{formatNaira(row.original.fineAmount)}</span>
        : <span className="text-muted-foreground">—</span>),
    },
    ...(canWrite ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }: { row: { original: LoanRow } }) => (
        row.original.status !== 'RETURNED' ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setReturning(row.original)}>
              <RotateCcw className="h-3.5 w-3.5" /> Return
            </Button>
          </div>
        ) : null
      ),
    } as ColumnDef<LoanRow, unknown>] : []),
  ], [canWrite])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Books on loan" value={outCount} icon={BookMarked} tone="primary" loading={isLoading} hint="Currently out with borrowers" />
        <StatCard label="Overdue" value={overdueCount} icon={TriangleAlert} tone={overdueCount ? 'destructive' : 'default'} loading={isLoading} hint={`Fined ${formatNaira(LIBRARY_FINE_PER_DAY)}/day`} />
        <StatCard label="Returned (recent)" value={rows.filter(r => r.status === 'RETURNED').length} icon={RotateCcw} tone="success" loading={isLoading} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        rowId={r => r.id}
        searchPlaceholder="Search borrower or book…"
        searchExtractor={r => `${r.borrowerName} ${r.bookTitle}`}
        initialPageSize={15}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All loans</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => setIssueOpen(true)}>
                <Plus className="h-4 w-4" /> Issue book
              </Button>
            )}
          </div>
        }
        emptyState={
          <EmptyState
            icon={BookMarked}
            title="No loans recorded"
            description="Issue a book to a student or staff member — returns and fines are tracked automatically."
            action={canWrite ? <Button onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" /> Issue book</Button> : undefined}
          />
        }
      />

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <ReturnDialog loan={returning} onOpenChange={o => !o && setReturning(null)} />
    </div>
  )
}

function IssueDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [bookId, setBookId] = useState('')
  const [borrowerType, setBorrowerType] = useState<'STUDENT' | 'EMPLOYEE'>('STUDENT')
  const [borrowerId, setBorrowerId] = useState('')
  const [dueDate, setDueDate] = useState(defaultLoanDueDate())
  const [error, setError] = useState<string | undefined>()

  const { data: booksData } = useQuery({
    queryKey: qk.books({ available: true }),
    queryFn: () => api<BooksPayload>('/library/books', { query: { available: '1', pageSize: 200 } }),
    enabled: open,
  })
  const { data: studentsData } = useQuery({
    queryKey: qk.students({ status: 'ACTIVE', pageSize: 300 }),
    queryFn: () => api<{ items: { id: string; firstName: string; lastName: string; otherName: string | null; admissionNumber: string }[] }>('/students', { query: { status: 'ACTIVE', pageSize: 300 } }),
    enabled: open && borrowerType === 'STUDENT',
  })
  const { data: staffData } = useQuery({
    queryKey: qk.employees(''),
    queryFn: () => api<{ items: { id: string; fullName: string; position: string }[] }>('/employees', { query: { pageSize: 200 } }),
    enabled: open && borrowerType === 'EMPLOYEE',
  })
  const books = booksData?.items ?? []
  const selectedBook = books.find(b => b.id === bookId)

  const save = useMutation({
    mutationFn: () => api('/library/loans', {
      method: 'POST',
      body: { bookId, borrowerType, borrowerId, dueDate },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] })
      toast.success('Book issued — it now shows in the register with its due date')
      onOpenChange(false)
      setBookId(''); setBorrowerId('')
    },
    onError: e => setError(e.message),
  })

  const valid = !!bookId && !!borrowerId && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= today()

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue a book</DialogTitle>
          <DialogDescription>Only books with copies on the shelf can be issued. Fines accrue ₦50/day past the due date.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ln-book">Book *</Label>
            <Select value={bookId} onValueChange={v => { setBookId(v); setError(undefined) }}>
              <SelectTrigger id="ln-book"><SelectValue placeholder="Pick a book with available copies" /></SelectTrigger>
              <SelectContent>
                {books.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title} — {b.availableCopies} of {b.totalCopies} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBook && (
              <p className="text-xs text-muted-foreground">Shelf {selectedBook.shelf ?? '—'} · {selectedBook.author ?? 'Unknown author'}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Borrower type">
            {(['STUDENT', 'EMPLOYEE'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setBorrowerType(t); setBorrowerId(''); setError(undefined) }}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors',
                  borrowerType === t ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted/50',
                )}
                aria-pressed={borrowerType === t}
              >
                <UserRound className="h-4 w-4" aria-hidden /> {t === 'STUDENT' ? 'Student' : 'Staff member'}
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ln-borrower">{borrowerType === 'STUDENT' ? 'Student *' : 'Staff member *'}</Label>
            <Select value={borrowerId} onValueChange={v => { setBorrowerId(v); setError(undefined) }}>
              <SelectTrigger id="ln-borrower"><SelectValue placeholder={borrowerType === 'STUDENT' ? 'Pick a student' : 'Pick a staff member'} /></SelectTrigger>
              <SelectContent>
                {borrowerType === 'STUDENT'
                  ? (studentsData?.items ?? []).map(s => (
                      <SelectItem key={s.id} value={s.id}>{[s.firstName, s.lastName, s.otherName].filter(Boolean).join(' ')} ({s.admissionNumber})</SelectItem>
                    ))
                  : (staffData?.items ?? []).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.fullName} — {e.position}</SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ln-due">Return due date *</Label>
            <Input id="ln-due" type="date" value={dueDate} min={today()} onChange={e => { setDueDate(e.target.value); setError(undefined) }} />
          </div>
        </div>
        {error && <FieldError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !valid}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Issue book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReturnDialog({ loan, onOpenChange }: {
  loan: LoanRow | null
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [fineInput, setFineInput] = useState<string | null>(null) // null = auto

  const autoFine = loan ? Math.min(loan.daysOverdue * LIBRARY_FINE_PER_DAY, 500_000) : 0
  const effectiveFine = fineInput === null ? autoFine : Math.max(0, Math.round(Number(fineInput.replace(/,/g, '')) * 100) || 0)

  const save = useMutation({
    mutationFn: () => api(`/library/loans/${loan!.id}/return`, {
      method: 'PATCH',
      body: fineInput === null ? {} : { fineAmount: effectiveFine },
    }),
    onSuccess: res => {
      void qc.invalidateQueries({ queryKey: ['library'] })
      const fine = (res as { fineAmount?: number })?.fineAmount ?? 0
      toast.success(fine > 0 ? `Book received — fine of ${formatNaira(fine)} recorded` : 'Book received back — no fine due')
      onOpenChange(false)
      setFineInput(null)
    },
    onError: e => toast.error(e.message),
  })

  return (
    <Dialog open={!!loan} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive “{loan?.bookTitle}”</DialogTitle>
          <DialogDescription>From {loan?.borrowerName} · issued {prettyDate(loan?.borrowedAt)}, due {prettyDate(loan?.dueDate)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            {loan && loan.daysOverdue > 0 ? (
              <p>
                <TriangleAlert className="mr-1 inline h-4 w-4 text-rose-500" aria-hidden />
                <span className="font-medium">{loan.daysOverdue} day{loan.daysOverdue === 1 ? '' : 's'} overdue</span> — suggested fine{' '}
                <span className="font-semibold tabular-nums">{formatNaira(autoFine)}</span> ({formatNaira(LIBRARY_FINE_PER_DAY)}/day).
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <RotateCcw className="h-4 w-4" aria-hidden /> On time — no fine is due.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rt-fine">Fine to record (₦)</Label>
            <Input
              id="rt-fine"
              inputMode="decimal"
              value={fineInput === null ? String(autoFine / 100) : fineInput}
              onChange={e => setFineInput(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Set to 0 to waive the fine, or adjust the amount if the librarian agrees otherwise.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Receive book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
