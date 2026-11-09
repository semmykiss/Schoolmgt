'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'
import { Card, CardContent } from '@/components/ui/card'

interface EventRow {
  id: string
  title: string
  description: string | null
  type: string // EXAM | HOLIDAY | MEETING | ACTIVITY | OTHER
  startDate: string
  endDate: string
  audience: string
  classId: string | null
  class: { id: string; name: string } | null
}

const TYPE_STYLE: Record<string, string> = {
  EXAM: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  HOLIDAY: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  MEETING: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ACTIVITY: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  OTHER: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
}
const TYPE_LABEL: Record<string, string> = {
  EXAM: 'Exam', HOLIDAY: 'Holiday', MEETING: 'Meeting', ACTIVITY: 'Activity', OTHER: 'Other',
}
const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'Everyone', STAFF: 'Staff', PARENTS: 'Parents', STUDENTS: 'Students', CLASS: 'One class',
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Create / edit dialog ────────────────────────────────────────────────────
function EventDialog({ open, onOpenChange, editing, initialDate }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: EventRow | null
  initialDate: string
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [type, setType] = useState(editing?.type ?? 'OTHER')
  const [startDate, setStartDate] = useState(editing?.startDate ?? initialDate)
  const [endDate, setEndDate] = useState(editing?.endDate ?? initialDate)
  const [audience, setAudience] = useState(editing?.audience ?? 'ALL')
  const [classId, setClassId] = useState(editing?.classId ?? '')
  const [error, setError] = useState<string | undefined>()

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/academics/classes'),
    enabled: open,
  })
  const classes = classesData?.items ?? []

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(), description: description.trim(), type,
        startDate, endDate: endDate < startDate ? startDate : endDate, audience,
        classId: audience === 'CLASS' ? classId : null,
      }
      return editing
        ? api(`/communication/events/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/communication/events', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication', 'events'] })
      toast.success(editing ? 'Event updated' : 'Event added to the calendar')
      onOpenChange(false)
    },
    onError: err => setError(err instanceof Error ? err.message : 'Could not save event'),
  })

  const valid = title.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (audience !== 'CLASS' || classId !== '')

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit event' : 'New calendar event'}</DialogTitle>
          <DialogDescription>Exams, holidays, meetings and activities appear on the school calendar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title" value={title} maxLength={160}
              onChange={e => { setTitle(e.target.value); setError(undefined) }}
              placeholder="e.g. Mid-term Break"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Starts</Label>
              <Input id="ev-start" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setError(undefined) }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Ends</Label>
              <Input id="ev-end" type="date" value={endDate < startDate ? startDate : endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={v => { setAudience(v); setError(undefined) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {audience === 'CLASS' && (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose class" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="ev-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={4000} />
          </div>
          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => (valid ? save.mutate() : setError('Add a title (3+ characters) and a start date'))}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? 'Save changes' : 'Add event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export function CalendarView() {
  const canWrite = useSession(s => s.can('communication.events.write'))
  const qc = useQueryClient()
  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EventRow | null>(null)
  const [initialDate, setInitialDate] = useState(iso(today))
  const [removeTarget, setRemoveTarget] = useState<EventRow | null>(null)

  const monthStart = new Date(cursor.y, cursor.m, 1)
  const monthEnd = new Date(cursor.y, cursor.m + 1, 0)
  const rangeFrom = iso(monthStart)
  const rangeTo = iso(monthEnd)

  const { data, isLoading } = useQuery({
    queryKey: qk.events({ from: rangeFrom, to: rangeTo }),
    queryFn: () => api<{ items: EventRow[] }>('/communication/events', { query: { from: rangeFrom, to: rangeTo } }),
  })
  const events = data?.items ?? []

  const remove = useMutation({
    mutationFn: (id: string) => api(`/communication/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication', 'events'] })
      toast.success('Event removed from the calendar')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  /** Grid of 42 cells (6 weeks) starting Monday. */
  const grid = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7 // Monday = 0
    const cells: { date: string; inMonth: boolean }[] = []
    const start = new Date(cursor.y, cursor.m, 1 - firstDow)
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      cells.push({ date: iso(d), inMonth: d.getMonth() === cursor.m })
    }
    return cells
  }, [cursor])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const ev of events) {
      // expand multi-day events across their span (cap 31 days for safety)
      const start = new Date(`${ev.startDate}T00:00:00`)
      const end = new Date(`${ev.endDate}T00:00:00`)
      for (let d = new Date(start); d <= end && map.size <= 400; d.setDate(d.getDate() + 1)) {
        const key = iso(d)
        const list = map.get(key) ?? []
        if (list.length < 3) list.push(ev)
        map.set(key, list)
      }
    }
    return map
  }, [events])

  const upcoming = useMemo(() => {
    const t = iso(today)
    return [...events].filter(e => e.endDate >= t).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 6)
  }, [events])

  const openNew = (date: string) => { setEditing(null); setInitialDate(date); setDialogOpen(true) }

  const monthLabel = monthStart.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const todayIsoStr = iso(today)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Event Calendar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Term dates, exams, holidays and meetings — visible to staff, parents and students
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => openNew(todayIsoStr)}>
            <Plus aria-hidden /> Add event
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden p-0">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{monthLabel}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  aria-label="Previous month"
                  onClick={() => setCursor(c => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-8 px-3 text-xs"
                  onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
                >
                  Today
                </Button>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  aria-label="Next month"
                  onClick={() => setCursor(c => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map(d => (
                <div key={d} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>
              ))}
              {grid.map(cell => {
                const dayEvents = eventsByDate.get(cell.date) ?? []
                const isToday = cell.date === todayIsoStr
                const dayNum = Number(cell.date.slice(-2))
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => canWrite && openNew(cell.date)}
                    aria-label={`${new Date(`${cell.date}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}${dayEvents.length ? `, ${dayEvents.length} event(s)` : ''}${canWrite ? ' — click to add event' : ''}`}
                    className={cn(
                      'flex min-h-16 flex-col items-stretch gap-0.5 rounded-md border p-1 text-left transition-colors sm:min-h-20',
                      cell.inMonth ? 'bg-card' : 'bg-muted/40 opacity-60',
                      isToday && 'border-primary ring-1 ring-primary',
                      canWrite && 'hover:border-primary/50 hover:bg-accent/40',
                    )}
                  >
                    <span className={cn(
                      'text-[11px] font-medium tabular-nums',
                      isToday ? 'text-primary' : cell.inMonth ? 'text-foreground' : 'text-muted-foreground',
                    )}>
                      {dayNum}
                    </span>
                    {dayEvents.map(ev => (
                      <span
                        key={ev.id}
                        className={cn('truncate rounded border px-1 py-0.5 text-[10px] leading-tight', TYPE_STYLE[ev.type] ?? TYPE_STYLE.OTHER)}
                        title={`${ev.title} (${TYPE_LABEL[ev.type] ?? 'Other'})`}
                      >
                        {ev.title}
                      </span>
                    ))}
                  </button>
                )
              })}
            </div>
            {isLoading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading events…
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Upcoming
              </h3>
              {upcoming.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled — add the next event.</p>
              ) : (
                <ul className="space-y-2.5">
                  {upcoming.map(ev => (
                    <li key={ev.id} className="group flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.startDate === ev.endDate
                            ? new Date(`${ev.startDate}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
                            : `${ev.startDate} → ${ev.endDate}`}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0', TYPE_STYLE[ev.type] ?? TYPE_STYLE.OTHER)}>
                        {TYPE_LABEL[ev.type] ?? 'Other'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canWrite && events.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Manage events</h3>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {events.map(ev => (
                    <li key={ev.id} className="flex items-center justify-between gap-2 rounded px-1 py-1.5 hover:bg-accent/50">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{ev.title}</p>
                        <p className="text-[11px] text-muted-foreground">{ev.startDate}</p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          aria-label={`Edit ${ev.title}`}
                          onClick={() => { setEditing(ev); setDialogOpen(true) }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label={`Delete ${ev.title}`}
                          onClick={() => setRemoveTarget(ev)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {events.length === 0 && !isLoading && (
        <EmptyState
          compact
          icon={CalendarDays}
          title={`No events in ${monthLabel}`}
          description={canWrite ? 'Click any day to schedule an event, or use the Add event button.' : 'Check back later — the school will publish term dates and activities here.'}
        />
      )}

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        initialDate={initialDate}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={o => { if (!o) setRemoveTarget(null) }}
        title={`Remove "${removeTarget?.title ?? ''}"?`}
        description="The event disappears from the school calendar for everyone."
        confirmLabel="Remove event" destructive
        onConfirm={async () => { if (removeTarget) await remove.mutateAsync(removeTarget.id) }}
      />
    </motion.div>
  )
}
