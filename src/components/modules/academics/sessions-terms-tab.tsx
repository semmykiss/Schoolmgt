'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarRange, Loader2, MoreHorizontal, Pencil, Plus, Star, Trash2,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { sessionCreateSchema, sessionUpdateSchema, termCreateSchema, termUpdateSchema } from '@/lib/validation/academic'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import { TERM_LABEL, fmtDateRange } from './academic-helpers'

// ── data shapes ─────────────────────────────────────────────────────────────
interface TermRow {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean
}
interface SessionRow {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean
  terms: TermRow[]
}

// ── schemas (client mirrors of the API zod shapes) ──────────────────────────
const sessionFormSchema = z.object({
  name: z.string().trim().min(3, 'e.g. 2025/2026').max(30),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  setCurrent: z.boolean(),
}).refine(v => v.endDate > v.startDate, { message: 'End date must be after start', path: ['endDate'] })
type SessionValues = z.infer<typeof sessionFormSchema>

const termFormSchema = z.object({
  name: z.enum(['FIRST', 'SECOND', 'THIRD']),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  setCurrent: z.boolean(),
}).refine(v => v.endDate > v.startDate, { message: 'End date must be after start', path: ['endDate'] })
type TermValues = z.infer<typeof termFormSchema>

// ── session dialog ──────────────────────────────────────────────────────────
function SessionDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: SessionRow | null }) {
  const qc = useQueryClient()
  const form = useForm<SessionValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: { name: '', startDate: '', endDate: '', setCurrent: false },
  })

  // sync defaults when opening for edit
  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name, startDate: editing.startDate, endDate: editing.endDate, setCurrent: editing.isCurrent }
      : { name: '', startDate: '', endDate: '', setCurrent: false })
  }

  const save = useMutation({
    mutationFn: (v: SessionValues) => editing
      ? api(`/academics/sessions/${editing.id}`, { method: 'PATCH', body: { ...v, setCurrent: v.setCurrent && !editing.isCurrent ? true : undefined } })
      : api('/academics/sessions', { method: 'POST', body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      qc.invalidateQueries({ queryKey: ['session'] })
      toast.success(editing ? 'Session updated' : 'Session created')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit session' : 'New session'}</DialogTitle>
          <DialogDescription>A session is one school year, e.g. 2025/2026. Terms live inside it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sess-name">Session name</Label>
            <Input id="sess-name" placeholder="2025/2026" {...form.register('name')} />
            <FieldError message={errs.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sess-start">Start date</Label>
              <Input id="sess-start" type="date" {...form.register('startDate')} />
              <FieldError message={errs.startDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-end">End date</Label>
              <Input id="sess-end" type="date" {...form.register('endDate')} />
              <FieldError message={errs.endDate?.message} />
            </div>
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.watch('setCurrent')} onCheckedChange={c => form.setValue('setCurrent', c === true)} />
              Make this the current session
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── term dialog ─────────────────────────────────────────────────────────────
function TermDialog({ open, onOpenChange, sessionId, sessionName, editing }: {
  open: boolean; onOpenChange: (o: boolean) => void
  sessionId: string; sessionName: string; editing: TermRow | null
}) {
  const qc = useQueryClient()
  const form = useForm<TermValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: { name: 'FIRST', startDate: '', endDate: '', setCurrent: false },
  })

  const [seenKey, setSeenKey] = useState('')
  const openKey = `${open}-${editing?.id ?? 'new'}`
  if (open && seenKey !== openKey) {
    setSeenKey(openKey)
    form.reset(editing
      ? { name: editing.name as TermValues['name'], startDate: editing.startDate, endDate: editing.endDate, setCurrent: false }
      : { name: 'FIRST', startDate: '', endDate: '', setCurrent: false })
  }

  const save = useMutation({
    mutationFn: (v: TermValues) => editing
      ? api(`/academics/terms/${editing.id}`, { method: 'PATCH', body: v })
      : api('/academics/terms', { method: 'POST', body: { ...v, sessionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      qc.invalidateQueries({ queryKey: ['session'] })
      toast.success(editing ? 'Term updated' : 'Term added')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })
  const errs = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit term' : 'Add term'}</DialogTitle>
          <DialogDescription>{editing ? 'Update dates or the term name.' : `Add a First/Second/Third term to ${sessionName}.`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label>Term</Label>
            <Controller
              name="name" control={form.control}
              render={({ field }) => (
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Term">
                  {(['FIRST', 'SECOND', 'THIRD'] as const).map(n => (
                    <button
                      key={n} type="button" role="radio" aria-checked={field.value === n}
                      onClick={() => field.onChange(n)}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        field.value === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {TERM_LABEL[n].replace(' Term', '')}
                    </button>
                  ))}
                </div>
              )}
            />
            <FieldError message={errs.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="term-start">Start date</Label>
              <Input id="term-start" type="date" {...form.register('startDate')} />
              <FieldError message={errs.startDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="term-end">End date</Label>
              <Input id="term-end" type="date" {...form.register('endDate')} />
              <FieldError message={errs.endDate?.message} />
            </div>
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.watch('setCurrent')} onCheckedChange={c => form.setValue('setCurrent', c === true)} />
              Make this the current term
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Add term'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── main tab ────────────────────────────────────────────────────────────────
export function SessionsTermsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null)
  const [termDialogOpen, setTermDialogOpen] = useState(false)
  const [termSession, setTermSession] = useState<SessionRow | null>(null)
  const [editingTerm, setEditingTerm] = useState<TermRow | null>(null)
  const [deleteSession, setDeleteSession] = useState<SessionRow | null>(null)
  const [deleteTerm, setDeleteTerm] = useState<{ term: TermRow; session: SessionRow } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: SessionRow[] }>('/academics/sessions'),
  })
  const sessions = data?.items ?? []

  const activateTerm = useMutation({
    mutationFn: (id: string) => api(`/academics/terms/${id}/activate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      qc.invalidateQueries({ queryKey: ['session'] })
      toast.success('Current term updated')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Failed'),
  })
  const removeSession = useMutation({
    mutationFn: (id: string) => api(`/academics/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Session deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })
  const removeTerm = useMutation({
    mutationFn: (id: string) => api(`/academics/terms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      toast.success('Term deleted')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sessions group each school year and its three terms. The <Badge variant="outline" className="mx-1 border-primary/40 bg-primary/10 text-primary">Current</Badge>
          session/term drives dashboards, attendance and invoicing.
        </p>
        {canWrite && (
          <Button onClick={() => { setEditingSession(null); setSessionDialogOpen(true) }}>
            <Plus aria-hidden /> New session
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map(i => <SkeletonCard key={i} />)}</div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No sessions yet"
          description="Create your first school year — for example 2025/2026 — then add its three terms."
          action={canWrite ? <Button onClick={() => { setEditingSession(null); setSessionDialogOpen(true) }}><Plus aria-hidden /> New session</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map(s => (
            <Card key={s.id} className={s.isCurrent ? 'border-primary/50 shadow-sm' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{s.name}</h3>
                      {s.isCurrent && (
                        <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
                          <Star className="h-3 w-3" aria-hidden /> Current
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{fmtDateRange(s.startDate, s.endDate)}</p>
                  </div>
                  {canWrite && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for session ${s.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => { setEditingSession(s); setSessionDialogOpen(true) }}>
                          <Pencil aria-hidden /> Edit session
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteSession(s)}>
                          <Trash2 aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <Separator className="my-3" />
                <ul className="space-y-1.5" aria-label={`Terms in ${s.name}`}>
                  {s.terms.length === 0 && <li className="py-1 text-sm text-muted-foreground">No terms yet.</li>}
                  {s.terms.map(t => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{TERM_LABEL[t.name] ?? t.name}</span>
                        {t.isCurrent && <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Current</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="hidden text-xs text-muted-foreground sm:inline">{fmtDateRange(t.startDate, t.endDate)}</span>
                        {canWrite && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${TERM_LABEL[t.name]}`}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {!t.isCurrent && (
                                <DropdownMenuItem onSelect={() => activateTerm.mutate(t.id)}>
                                  <Star aria-hidden /> Set as current
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => { setTermSession(s); setEditingTerm(t); setTermDialogOpen(true) }}>
                                <Pencil aria-hidden /> Edit term
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTerm({ term: t, session: s })}>
                                <Trash2 aria-hidden /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {canWrite && (
                  <Button
                    variant="outline" size="sm" className="mt-3 w-full"
                    onClick={() => { setTermSession(s); setEditingTerm(null); setTermDialogOpen(true) }}
                  >
                    <Plus aria-hidden /> Add term
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SessionDialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen} editing={editingSession} />
      <TermDialog
        open={termDialogOpen} onOpenChange={setTermDialogOpen}
        sessionId={termSession?.id ?? ''} sessionName={termSession?.name ?? ''} editing={editingTerm}
      />
      <ConfirmDialog
        open={deleteSession !== null}
        onOpenChange={o => { if (!o) setDeleteSession(null) }}
        title={`Delete session ${deleteSession?.name ?? ''}?`}
        description="Terms inside it are removed too. Exams recorded under this session block deletion."
        confirmLabel="Delete session" destructive
        onConfirm={async () => { if (deleteSession) await removeSession.mutateAsync(deleteSession.id) }}
      />
      <ConfirmDialog
        open={deleteTerm !== null}
        onOpenChange={o => { if (!o) setDeleteTerm(null) }}
        title={`Delete ${TERM_LABEL[deleteTerm?.term.name ?? ''] ?? 'term'}?`}
        description={`This removes the term from ${deleteTerm?.session.name ?? ''}. Exams recorded under it block deletion.`}
        confirmLabel="Delete term" destructive
        onConfirm={async () => { if (deleteTerm) await removeTerm.mutateAsync(deleteTerm.term.id) }}
      />
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-5 space-y-3" aria-hidden>
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-16 animate-pulse rounded bg-muted" />
    </div>
  )
}
