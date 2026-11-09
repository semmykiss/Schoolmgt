'use client'

import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

interface AuditRow {
  id: string
  userName: string | null
  action: string
  entity: string
  entityId: string | null
  summary: string | null
  before: string | null
  after: string | null
  ip: string | null
  createdAt: string
}

interface AuditResponse {
  items: AuditRow[]
  total: number
  page: number
  pageSize: number
  actions: string[]
}

const ACTION_TONE: Record<string, string> = {
  CREATE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  UPDATE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  DELETE: 'bg-destructive/10 text-destructive',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
  EXPORT: 'bg-primary/10 text-primary',
  PUBLISH: 'bg-primary/10 text-primary',
  APPROVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  REJECT: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  RESTORE: 'bg-primary/10 text-primary',
}

function prettyJson(raw: string | null): string | null {
  if (!raw) return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function AuditView() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('all')
  const [entity, setEntity] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<AuditRow | null>(null)

  const queryKey = qk.auditLogs({ page, action, entity, q, from, to })
  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: '25' })
      if (action !== 'all') qs.set('action', action)
      if (entity.trim()) qs.set('entity', entity.trim())
      if (q.trim()) qs.set('q', q.trim())
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      return api<AuditResponse>(`/audit-logs?${qs.toString()}`)
    },
  })

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 25
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <FadeIn>
      <PageHeader
        title="Audit Log"
        description="Every mutation, login and export — who did what, when"
      />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="audit-q" className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <Input
                  id="audit-q" value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
                  placeholder="User, summary…" className="h-9 w-[190px] pl-8" aria-label="Search audit log"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={action} onValueChange={v => { setAction(v); setPage(1) }}>
                <SelectTrigger className="h-9 w-[130px] text-xs" aria-label="Filter by action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {(data?.actions ?? []).map(a => (
                    <SelectItem key={a} value={a}>{ACTION_TONE[a] ? a : a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-entity" className="text-xs text-muted-foreground">Entity</Label>
              <Input
                id="audit-entity" value={entity} onChange={e => { setEntity(e.target.value); setPage(1) }}
                placeholder="e.g. FeeInvoice" className="h-9 w-[150px]" aria-label="Filter by entity"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="audit-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} className="h-9 w-[140px]" aria-label="From date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="audit-to" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} className="h-9 w-[140px]" aria-label="To date" />
            </div>
            <p className="ml-auto pb-2 text-xs text-muted-foreground">
              {isLoading ? 'Loading…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
            </p>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit entries" description="Try widening the filters — entries appear as staff use the system." />
          ) : (
            <div className="max-h-[520px] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">When</TableHead>
                    <TableHead className="w-[150px]">User</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                    <TableHead className="w-[130px]">Entity</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-[110px]">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(row.createdAt), 'd MMM yy, HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm">{row.userName ?? 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn('font-medium', ACTION_TONE[row.action] ?? 'bg-muted text-muted-foreground')}>
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.entity}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <p className="truncate text-xs text-muted-foreground">{row.summary ?? row.entityId ?? '—'}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.ip ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {data?.page ?? page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" disabled={page <= 1 || isFetching}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
                Prev
              </Button>
              <Button
                variant="outline" size="sm" disabled={page >= totalPages || isFetching}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={detail !== null} onOpenChange={o => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {detail && (
                <Badge variant="secondary" className={cn('font-medium', ACTION_TONE[detail.action] ?? 'bg-muted text-muted-foreground')}>
                  {detail.action}
                </Badge>
              )}
              {detail?.entity}
            </DialogTitle>
            <DialogDescription>
              {detail && `${detail.userName ?? 'System'} • ${format(new Date(detail.createdAt), 'd MMM yyyy, HH:mm:ss')}${detail.ip ? ` • ${detail.ip}` : ''}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {detail?.summary && <p className="text-muted-foreground">{detail.summary}</p>}
            {detail?.entityId && (
              <p className="font-mono text-xs text-muted-foreground">ID: {detail.entityId}</p>
            )}
            {prettyJson(detail?.before ?? null) && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Before</p>
                <pre className="max-h-44 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                  {prettyJson(detail!.before)}
                </pre>
              </div>
            )}
            {prettyJson(detail?.after ?? null) && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">After</p>
                <pre className="max-h-44 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                  {prettyJson(detail!.after)}
                </pre>
              </div>
            )}
            {!detail?.before && !detail?.after && (
              <p className="text-xs text-muted-foreground">No before/after snapshot recorded for this entry.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}

/** Local wrapper so the view matches the motion entrance used by other views. */
function FadeIn({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      {children}
    </motion.div>
  )
}
