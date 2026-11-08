'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Award, Bell, CheckCheck, ClipboardCheck, GraduationCap, Loader2, LogOut, NotebookPen,
  Wallet, type LucideIcon,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/layout/topbar'

interface PortalNotification {
  id: string
  title: string
  body: string
  type: string
  link: string | null
  read: boolean
  createdAt: string
}

interface NotificationsResponse {
  items: PortalNotification[]
  unread: number
}

const CAPABILITIES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: ClipboardCheck, title: 'Attendance', description: 'Daily attendance and punctuality at a glance.' },
  { icon: Award, title: 'Results', description: 'Report cards and continuous assessment scores.' },
  { icon: Wallet, title: 'Fees', description: 'Invoices, receipts and payment history in NGN.' },
  { icon: NotebookPen, title: 'Homework', description: 'Assignments, due dates and submissions.' },
]

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

export function PortalHome() {
  const user = useSession(s => s.user)
  const school = useSession(s => s.school)
  const logout = useSession(s => s.logout)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<NotificationsResponse>('/notifications'),
    refetchInterval: 60_000,
  })
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read', { method: 'POST', body: { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not mark as read'),
  })

  const items = data?.items ?? []
  const unread = data?.unread ?? 0
  const year = new Date().getFullYear()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
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
                  <p className="text-xs font-normal text-muted-foreground">{titleCase(user?.role ?? '')}</p>
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
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* Welcome */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Welcome, {user?.fullName ?? 'there'} 👋</CardTitle>
            <CardDescription>
              You&apos;re signed in as a <span className="font-medium text-foreground">{titleCase(user?.role ?? 'user')}</span>
              {school ? ` at ${school.name}` : ''}.
            </CardDescription>
          </CardHeader>
          {school?.motto && (
            <CardContent>
              <p className="rounded-lg border-l-4 border-primary/40 bg-muted/50 px-4 py-3 text-sm italic text-muted-foreground">
                “{school.motto}”
              </p>
            </CardContent>
          )}
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
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
              <ul className="divide-y">
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

        {/* Upcoming capabilities */}
        <section aria-label="Coming soon to your portal" className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Coming soon to your portal</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CAPABILITIES.map(cap => (
              <Card
                key={cap.title}
                aria-disabled="true"
                className="select-none gap-3 bg-muted/40 py-4 opacity-80"
              >
                <CardHeader className="px-4">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <cap.icon className="h-4 w-4" aria-hidden />
                    </span>
                    {cap.title}
                    <Badge variant="secondary" className="ml-auto text-[10px]">Phase 6</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  <p className="text-xs text-muted-foreground">{cap.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-6">
          © {year} {school?.name ?? 'SchoolDesk'} • SchoolDesk v0.1 • Phase 1 of 10 — Academic Setup
        </div>
      </footer>
    </div>
  )
}
