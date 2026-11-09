'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Award, Bell, BookOpenCheck, CalendarDays, CheckCheck, ClipboardCheck, Clock, GraduationCap,
  Loader2, LogOut, NotebookPen, Send, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { formatNaira } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChildDetailsDialog } from '@/components/modules/portals/child-details-dialog'
import { ThemeToggle } from '@/components/layout/topbar'

// ── Types (mirrors /portal/overview payload) ────────────────────────────────
interface HomeworkSubmission {
  id: string
  status: string // SUBMITTED | LATE | GRADED
  score: number | null
  submittedAt: string
  note: string | null
}
interface HomeworkItem {
  id: string
  title: string
  description: string | null
  dueDate: string
  subject: string
  subjectCode: string | null
  teacher: string | null
  submission: HomeworkSubmission | null
}
interface ChildSummary {
  id: string
  fullName: string
  admissionNumber: string
  className: string | null
  sectionName: string | null
  photoUrl: string | null
  attendance: { pct: number; present: number; late: number; absent: number; total: number }
  results: { examName: string; average: number; grade: string | null; position: number } | null
  fees: { dueKobo: number; unpaidCount: number; overdueCount: number; nextDueDate: string | null }
  homework: { submitted: number; dueSoon: number; overdue: number; items: HomeworkItem[] }
  timetableToday: { period: string; startTime: string; endTime: string; subject: string | null; teacher: string | null; isBreak: boolean }[]
  announcements: { id: string; title: string; body: string; publishedAt: string | null; pinned: boolean }[]
}
interface PortalOverview {
  role: string
  term: { id: string; name: string; session: string } | null
  unread: number
  children: ChildSummary[]
}
interface PortalNotification {
  id: string
  title: string
  body: string
  type: string
  link: string | null
  read: boolean
  createdAt: string
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoDaysAhead(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Due-state badge for a homework row. */
function DueBadge({ item }: { item: HomeworkItem }) {
  const today = isoToday()
  if (item.submission?.status === 'GRADED') {
    return <Badge className="gap-1 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" variant="secondary">
      <Award className="h-3 w-3" aria-hidden /> Graded{item.submission.score != null ? ` · ${item.submission.score}` : ''}
    </Badge>
  }
  if (item.submission) {
    return <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
      <BookOpenCheck className="h-3 w-3" aria-hidden /> {item.submission.status === 'LATE' ? 'Late — submitted' : 'Submitted'}
    </Badge>
  }
  if (item.dueDate < today) {
    return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" aria-hidden /> Overdue</Badge>
  }
  if (item.dueDate <= isoDaysAhead(3)) {
    return <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" aria-hidden /> Due soon
    </Badge>
  }
  return <Badge variant="outline" className="gap-1">Due {prettyDate(item.dueDate)}</Badge>
}

// ── Submit homework dialog ──────────────────────────────────────────────────
function SubmitDialog({ item, studentId, open, onOpenChange }: {
  item: HomeworkItem | null
  studentId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')

  const submit = useMutation({
    mutationFn: () => api(`/assignments/${item?.id}/submissions`, {
      method: 'POST',
      body: { studentId, note },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.portal })
      toast.success('Homework submitted — nice work!')
      setNote('')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not submit homework'),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!submit.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit homework</DialogTitle>
          <DialogDescription>
            {item ? `${item.subject} — ${item.title} (due ${prettyDate(item.dueDate)})` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="submission-note" className="text-sm font-medium">
              Note to your teacher <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="submission-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Completed in my exercise book, pages 12–14."
              rows={4}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              Hand in physically in class and tick this as submitted, or describe where your work can be found.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending
              ? <Loader2 className="animate-spin" aria-hidden />
              : <Send className="h-4 w-4" aria-hidden />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Homework card ───────────────────────────────────────────────────────────
function HomeworkCard({ child, canSubmit, onSubmit }: {
  child: ChildSummary
  canSubmit: boolean
  onSubmit: (item: HomeworkItem) => void
}) {
  const { items, submitted, dueSoon, overdue } = child.homework

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <NotebookPen className="h-3.5 w-3.5" aria-hidden />
            </span>
            Homework
          </CardTitle>
          <CardDescription>
            {items.length === 0
              ? 'No homework posted recently'
              : `${submitted} submitted · ${dueSoon} due soon${overdue > 0 ? ` · ${overdue} overdue` : ''}`}
          </CardDescription>
        </div>
        {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        {items.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="All caught up"
            description="When teachers post homework for this class it will appear here with its due date."
            compact
          />
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
            {items.map(item => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{item.title}</span>
                    <DueBadge item={item} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.subject}{item.teacher ? ` · ${item.teacher}` : ''}
                    {item.submission?.submittedAt
                      ? ` · turned in ${formatDistanceToNow(new Date(item.submission.submittedAt), { addSuffix: true })}`
                      : ''}
                  </p>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                {canSubmit && item.submission?.status !== 'GRADED' && (
                  <Button
                    size="sm"
                    variant={item.submission ? 'outline' : 'default'}
                    className="h-8 shrink-0"
                    onClick={() => onSubmit(item)}
                  >
                    {item.submission ? 'Resubmit' : 'Submit'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ── Today's timetable ───────────────────────────────────────────────────────
function TimetableCard({ child }: { child: ChildSummary }) {
  const slots = child.timetableToday
  if (slots.length === 0) return null
  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long' })
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          </span>
          Today&apos;s lessons
        </CardTitle>
        <span className="text-xs text-muted-foreground">{today}</span>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {slots.map((s, i) => (
            <li key={`${s.period}-${i}`} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <span className={cn(
                'w-14 shrink-0 rounded-md px-1.5 py-1 text-center font-mono text-[11px]',
                s.isBreak ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
              )}>
                {s.startTime}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', s.isBreak ? 'text-muted-foreground' : 'font-medium')}>
                  {s.subject ?? s.period}
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.period}{s.teacher && !s.isBreak ? ` · ${s.teacher}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ── Announcements ───────────────────────────────────────────────────────────
function AnnouncementsCard({ child }: { child: ChildSummary }) {
  const items = child.announcements
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-3.5 w-3.5" aria-hidden />
          </span>
          Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {items.map(a => (
          <div key={a.id} className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {a.pinned && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}
              <p className="truncate text-sm font-medium">{a.title}</p>
            </div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{a.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Notifications (unchanged behaviour) ─────────────────────────────────────
function NotificationsCard() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<{ items: PortalNotification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  })
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read', { method: 'POST', body: { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not mark as read'),
  })

  const items = data?.items ?? []
  const unread = data?.unread ?? 0

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-3.5 w-3.5" aria-hidden />
            {unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" aria-label={`${unread} unread`} />}
          </span>
          Notifications
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {markAll.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            : <CheckCheck className="h-3.5 w-3.5" aria-hidden />}
          Mark all read
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        {isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading notifications…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up 🎉</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map(item => (
              <li
                key={item.id}
                className={cn('flex items-start gap-2.5 rounded-md px-2 py-2.5', !item.read && 'bg-primary/5')}
              >
                <span className={cn(
                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  item.read ? 'bg-transparent' : 'bg-primary',
                )} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main portal home ────────────────────────────────────────────────────────
export function PortalHome() {
  const user = useSession(s => s.user)
  const school = useSession(s => s.school)
  const logout = useSession(s => s.logout)
  const [childIndex, setChildIndex] = useState(0)
  const [submitItem, setSubmitItem] = useState<HomeworkItem | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const overview = useQuery({
    queryKey: qk.portal,
    queryFn: () => api<PortalOverview>('/portal/overview'),
    refetchInterval: 120_000,
    retry: false,
  })

  const children = overview.data?.children ?? []
  const child = children.length > 0 ? children[Math.min(childIndex, children.length - 1)] : null
  const role = overview.data?.role ?? user?.role ?? ''
  const term = overview.data?.term
  const year = new Date().getFullYear()

  const homeworkStats = useMemo(() => {
    if (!child) return null
    return child.homework
  }, [child])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="truncate text-sm font-semibold">{school?.name ?? 'SchoolDesk'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open profile menu"
                >
                  {initials(user?.fullName)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user?.fullName ?? 'Account'}</p>
                  <p className="text-xs font-normal text-muted-foreground">{titleCase(role)}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {user?.email ?? ''}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => { void logout() }}>
                  <LogOut aria-hidden /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* Welcome */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Welcome, {user?.fullName ?? 'there'} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You&apos;re signed in as a <span className="font-medium text-foreground">{titleCase(role)}</span>
            {school ? ` at ${school.name}` : ''}
            {term ? ` · ${titleCase(term.name)} term, ${term.session} session` : ''}
          </p>
        </div>

        {/* Child switcher (parents with 2+ children) */}
        {children.length > 1 && (
          <div role="tablist" aria-label="Choose child" className="flex gap-2 overflow-x-auto pb-1">
            {children.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={i === Math.min(childIndex, children.length - 1)}
                onClick={() => setChildIndex(i)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
                  i === Math.min(childIndex, children.length - 1)
                    ? 'border-primary bg-primary/10'
                    : 'bg-card hover:bg-muted',
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {initials(c.fullName)}
                </span>
                <span>
                  <span className="block text-sm font-medium leading-tight">{c.fullName}</span>
                  <span className="block text-xs text-muted-foreground leading-tight">
                    {c.className ?? '—'}{c.sectionName ? ` ${c.sectionName}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {overview.isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map(i => (
                <Card key={i} className="py-0"><CardContent className="p-5"><Skeleton className="h-12 w-full" /></CardContent></Card>
              ))}
            </div>
            <Card><CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent></Card>
          </div>
        )}

        {/* Error (e.g. account not linked to a student) */}
        {overview.isError && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm font-medium">Portal unavailable</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {overview.error instanceof Error ? overview.error.message : 'Could not load your portal.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Overview for the selected child */}
        {child && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Attendance"
                value={`${child.attendance.pct}%`}
                icon={ClipboardCheck}
                hint={child.attendance.total > 0 ? `${child.attendance.present + child.attendance.late}/${child.attendance.total} days present` : 'No marks yet'}
                tone={child.attendance.pct >= 90 ? 'success' : child.attendance.pct >= 75 ? 'default' : 'warning'}
              />
              <StatCard
                label="Fees due"
                value={formatNaira(child.fees.dueKobo, { compact: true })}
                icon={Wallet}
                hint={child.fees.dueKobo === 0
                  ? 'All settled 🎉'
                  : child.fees.overdueCount > 0
                    ? `${child.fees.overdueCount} overdue invoice${child.fees.overdueCount > 1 ? 's' : ''}`
                    : `Next due ${child.fees.nextDueDate ? prettyDate(child.fees.nextDueDate) : '—'}`}
                tone={child.fees.dueKobo === 0 ? 'success' : child.fees.overdueCount > 0 ? 'destructive' : 'warning'}
              />
              <StatCard
                label="Homework"
                value={homeworkStats ? homeworkStats.dueSoon + homeworkStats.overdue : 0}
                icon={NotebookPen}
                hint={homeworkStats
                  ? homeworkStats.dueSoon + homeworkStats.overdue === 0
                    ? `${homeworkStats.submitted} submitted — all done`
                    : `${homeworkStats.submitted} of ${homeworkStats.items.length} submitted`
                  : undefined}
                tone={homeworkStats && homeworkStats.overdue > 0 ? 'destructive' : 'primary'}
              />
              <StatCard
                label="Latest average"
                value={child.results ? `${Math.round(child.results.average)}%` : '—'}
                icon={TrendingUp}
                hint={child.results
                  ? `${child.results.examName}${child.results.position ? ` · ${child.results.position}${child.results.position === 1 ? 'st' : child.results.position === 2 ? 'nd' : child.results.position === 3 ? 'rd' : 'th'} in class` : ''}`
                  : 'No published results yet'}
                tone="primary"
              />
            </div>

            <HomeworkCard
              child={child}
              canSubmit
              onSubmit={item => setSubmitItem(item)}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <TimetableCard child={child} />
              <AnnouncementsCard child={child} />
            </div>
          </>
        )}

        <NotificationsCard />

        {/* Drill-in details */}
        {child && (
          <ChildDetailsDialog
            studentId={child.id}
            studentName={child.fullName}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            trigger={
              <Button variant="outline" className="w-full sm:w-auto">
                <Award className="h-4 w-4" aria-hidden /> View {role === 'PARENT' ? 'child' : 'full'} records — results, fees & attendance
              </Button>
            }
          />
        )}
      </main>

      {/* Submit dialog */}
      <SubmitDialog
        item={submitItem}
        studentId={child?.id ?? ''}
        open={submitItem !== null}
        onOpenChange={o => { if (!o) setSubmitItem(null) }}
      />

      {/* Footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto w-full max-w-4xl px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-6">
          © {year} {school?.name ?? 'SchoolDesk'} • SchoolDesk Portal
        </div>
      </footer>
    </div>
  )
}
