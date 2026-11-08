'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useTheme } from 'next-themes'
import {
  Bell, Braces, CalendarClock, CheckCheck, Info, LogOut, Loader2, MapPin, Megaphone,
  Menu, Moon, Search, Sun, Wallet, type LucideIcon,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { navigate } from '@/hooks/use-hash-route'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------- Theme toggle

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}

// -------------------------------------------------------------- Branch switch

function BranchSwitcher() {
  const branches = useSession(s => s.branches)
  const [selected, setSelected] = useState<string | null>(null)

  // Derive the active branch (no effect needed): user choice wins, else main branch, else first.
  const activeId = useMemo(() => {
    if (branches.length === 0) return ''
    if (selected && branches.some(b => b.id === selected)) return selected
    return branches.find(b => b.isMain)?.id ?? branches[0].id
  }, [branches, selected])

  if (branches.length === 0) return null

  if (branches.length === 1) {
    const branch = branches[0]
    return (
      <div
        className="hidden h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground sm:flex"
        title={branch.name}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="max-w-28 truncate">{branch.name}</span>
      </div>
    )
  }

  return (
    <Select value={activeId} onValueChange={setSelected}>
      <SelectTrigger size="sm" className="h-9 max-w-36 sm:max-w-52" aria-label="Switch branch">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <SelectValue placeholder="Branch" />
      </SelectTrigger>
      <SelectContent>
        {branches.map(b => (
          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// --------------------------------------------------------------- Global search

interface SearchEntry {
  key: string
  label: string
  sub: string
  kind: 'student' | 'staff'
}

interface SearchResponse {
  students: { id: string; label: string; sub: string; status: string }[]
  staff: { id: string; label: string; sub: string }[]
}

function useSearchEntries(query: string) {
  const active = query.trim().length >= 2
  const searchQuery = useQuery({
    queryKey: ['search', query],
    queryFn: () => api<SearchResponse>('/search', { query: { q: query } }),
    enabled: active,
    staleTime: 30_000,
  })
  const entries = useMemo<SearchEntry[]>(() => {
    const students = (searchQuery.data?.students ?? []).map(s => ({ key: `s-${s.id}`, label: s.label, sub: s.sub, kind: 'student' as const }))
    const staff = (searchQuery.data?.staff ?? []).map(t => ({ key: `t-${t.id}`, label: t.label, sub: t.sub, kind: 'staff' as const }))
    return [...students, ...staff]
  }, [searchQuery.data])
  return { entries, loading: searchQuery.isFetching, active }
}

function SearchRow({ entry, highlighted, onSelect }: { entry: SearchEntry; highlighted: boolean; onSelect: (entry: SearchEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{entry.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{entry.sub}</span>
      </span>
      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">{entry.kind}</Badge>
    </button>
  )
}

function SearchResultsList({
  entries, loading, active, highlight, onSelect,
}: {
  entries: SearchEntry[]
  loading: boolean
  active: boolean
  highlight: number
  onSelect: (entry: SearchEntry) => void
}) {
  if (!active) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
  }
  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label="Searching">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  if (entries.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
  }
  const students = entries.filter(e => e.kind === 'student')
  const staff = entries.filter(e => e.kind === 'staff')
  return (
    <div>
      {students.length > 0 && (
        <div>
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Students</p>
          {students.map((e, i) => (
            <SearchRow key={e.key} entry={e} highlighted={i === highlight} onSelect={onSelect} />
          ))}
        </div>
      )}
      {staff.length > 0 && (
        <div>
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Staff</p>
          {staff.map((e, i) => (
            <SearchRow key={e.key} entry={e} highlighted={students.length + i === highlight} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function GlobalSearchDesktop() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [highlight, setHighlight] = useState(0)
  const debounced = useDebounced(value)
  const { entries, loading, active } = useSearchEntries(debounced)

  // Clamp instead of resetting from an effect so the index stays valid as results change.
  const current = Math.min(highlight, Math.max(0, entries.length - 1))

  const close = () => { setOpen(false); setValue('') }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, Math.max(0, entries.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && entries[current]) {
      navigate(entries[current].kind === 'student' ? '/students' : '/staff')
      close()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative hidden lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={value}
            onChange={e => {
              const v = e.target.value
              setValue(v)
              if (v.trim().length >= 2) setOpen(true)
              else setOpen(false)
            }}
            onFocus={() => { if (value.trim().length >= 2) setOpen(true) }}
            onKeyDown={onKeyDown}
            placeholder="Search students, staff…"
            aria-label="Global search"
            className="h-9 w-64 pl-8"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-1.5" onOpenAutoFocus={e => e.preventDefault()}>
        <SearchResultsList
          entries={entries} loading={loading} active={active} highlight={current}
          onSelect={entry => {
            navigate(entry.kind === 'student' ? '/students' : '/staff')
            close()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function GlobalSearchMobile() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [highlight, setHighlight] = useState(0)
  const debounced = useDebounced(value)
  const { entries, loading, active } = useSearchEntries(debounced)

  // Clamp instead of resetting from an effect so the index stays valid as results change.
  const current = Math.min(highlight, Math.max(0, entries.length - 1))

  const close = () => { setOpen(false); setValue('') }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, Math.max(0, entries.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && entries[current]) {
      navigate(entries[current].kind === 'student' ? '/students' : '/staff')
      close()
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search" onClick={() => setOpen(true)}>
        <Search className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-16 gap-0 p-4 translate-y-0 sm:top-20">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Search students and staff across your school</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search students, staff…"
              aria-label="Global search"
              className="h-11 pl-9"
            />
          </div>
          <div className="mt-2 max-h-[60vh] min-h-24 overflow-y-auto">
            <SearchResultsList
              entries={entries} loading={loading} active={active} highlight={current}
              onSelect={entry => {
                navigate(entry.kind === 'student' ? '/students' : '/staff')
                close()
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function GlobalSearch() {
  return (
    <>
      <GlobalSearchDesktop />
      <GlobalSearchMobile />
    </>
  )
}

// ------------------------------------------------------------------ Notifications

interface NotificationItem {
  id: string
  title: string
  body: string
  type: string
  link: string | null
  read: boolean
  createdAt: string
}

interface NotificationsResponse {
  items: NotificationItem[]
  unread: number
}

const NOTIF_ICON: Record<string, LucideIcon> = {
  LEAVE: CalendarClock,
  FEE: Wallet,
  ANNOUNCEMENT: Megaphone,
  SYSTEM: Info,
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<NotificationsResponse>('/notifications'),
    refetchInterval: 60_000,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.notifications })
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read', { method: 'POST', body: { all: true } }),
    onSuccess: invalidate,
  })
  const markOne = useMutation({
    mutationFn: (id: string) => api('/notifications/read', { method: 'POST', body: { ids: [id] } }),
    onSuccess: invalidate,
  })

  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden />}
            Mark all read
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up 🎉</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map(item => {
              const Icon = NOTIF_ICON[item.type] ?? Info
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.read) markOne.mutate(item.id)
                    if (item.link) navigate(item.link)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/60',
                    !item.read && 'bg-primary/5',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    !item.read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ------------------------------------------------------------------ Profile menu

function ProfileMenu() {
  const user = useSession(s => s.user)
  const logout = useSession(s => s.logout)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open profile menu"
        >
          {initials(user?.fullName)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{user?.fullName ?? 'Account'}</p>
          <p className="text-xs font-normal text-muted-foreground">{titleCase(user?.role ?? '')}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user?.email ?? ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/api-docs')}>
          <Braces aria-hidden /> API Explorer
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => { void logout() }}>
          <LogOut aria-hidden /> Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------- Topbar

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b bg-background/80 backdrop-blur">
      <div className="flex h-full items-center gap-1.5 px-4 sm:gap-2 sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation menu">
          <Menu className="h-5 w-5" />
        </Button>
        <BranchSwitcher />
        <div className="flex-1" />
        <GlobalSearch />
        <ThemeToggle />
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  )
}
