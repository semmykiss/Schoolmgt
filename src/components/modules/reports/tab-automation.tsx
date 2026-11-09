'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Bookmark, CalendarClock, FileDown, Plus, RefreshCw, Trash2,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export interface SavedFilterRow {
  id: string
  module: string
  name: string
  criteria: Record<string, unknown>
  createdAt: string
}

export interface ScheduledExportRow {
  id: string
  reportKey: string
  name: string
  frequency: string
  format: string
  recipients: string[]
  filters: Record<string, unknown>
  active: boolean
  lastRunAt: string | null
  createdAt: string
  label?: string
}

interface RunResult {
  filename: string
  csv: string
  rowCount: number
  notified: number
  unmatchedRecipients: string[]
}

const REPORT_OPTIONS = [
  { value: 'enrollment', label: 'Enrollment report' },
  { value: 'academic', label: 'Academic performance' },
  { value: 'financial', label: 'Financial summary' },
  { value: 'attendance', label: 'Attendance summary' },
]

function downloadCsvText(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

interface Props {
  onApply: (view: SavedFilterRow) => void
}

export function AutomationTab({ onApply }: Props) {
  const canWrite = useSession(s => s.can('reports.write'))
  const queryClient = useQueryClient()

  const savedViews = useQuery({
    queryKey: qk.savedFilters('reports'),
    queryFn: () => api<{ items: SavedFilterRow[] }>('/reports/saved-filters?module=reports'),
  })
  const exports = useQuery({
    queryKey: qk.scheduledExports,
    queryFn: () => api<{ items: ScheduledExportRow[] }>('/reports/scheduled-exports'),
  })

  // ── saved views ─────────────────────────────────────────────────────────
  const [deleteViewId, setDeleteViewId] = useState<string | null>(null)
  const deleteView = useMutation({
    mutationFn: (id: string) => api(`/reports/saved-filters/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('View deleted')
      void queryClient.invalidateQueries({ queryKey: qk.savedFilters() })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  // ── scheduled exports ───────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    name: '', reportKey: 'enrollment', frequency: 'WEEKLY', recipients: '',
  })
  const createExport = useMutation({
    mutationFn: () => {
      const recipients = form.recipients
        .split(/[,;\s]+/)
        .map(r => r.trim())
        .filter(Boolean)
      return api('/reports/scheduled-exports', {
        method: 'POST',
        body: { name: form.name.trim(), reportKey: form.reportKey, frequency: form.frequency, format: 'CSV', recipients, filters: {}, active: true },
      })
    },
    onSuccess: () => {
      toast.success('Schedule created — recipients will be notified on each run')
      setCreateOpen(false)
      setForm(f => ({ ...f, name: '', recipients: '' }))
      void queryClient.invalidateQueries({ queryKey: qk.scheduledExports })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not create schedule'),
  })

  const toggleExport = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/reports/scheduled-exports/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.scheduledExports }),
    onError: err => toast.error(err instanceof Error ? err.message : 'Update failed'),
  })

  const [deleteExportId, setDeleteExportId] = useState<string | null>(null)
  const deleteExport = useMutation({
    mutationFn: (id: string) => api(`/reports/scheduled-exports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Schedule deleted')
      void queryClient.invalidateQueries({ queryKey: qk.scheduledExports })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const runExport = useMutation({
    mutationFn: (id: string) => api<RunResult>(`/reports/scheduled-exports/${id}/run`, { method: 'POST' }),
    onSuccess: result => {
      downloadCsvText(result.filename, result.csv)
      toast.success(`Exported ${result.rowCount} row(s) — ${result.notified} recipient(s) notified`, {
        description: result.unmatchedRecipients.length
          ? `Not on SchoolDesk: ${result.unmatchedRecipients.join(', ')}`
          : undefined,
      })
      void queryClient.invalidateQueries({ queryKey: qk.scheduledExports })
      void queryClient.invalidateQueries({ queryKey: qk.notifications })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Run failed'),
  })

  return (
    <div className="space-y-4">
      {/* Saved views */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bookmark className="h-3.5 w-3.5" aria-hidden />
            </span>
            Saved report views
          </CardTitle>
          <CardDescription className="text-xs">
            One-click snapshots of a report tab with its filters. Create them from the “Save current view” button above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedViews.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (savedViews.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={Bookmark} title="No saved views yet" description="Apply filters on any report tab, then save the view to reuse it." compact className="border-0" />
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {savedViews.data!.items.map(v => (
                <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {Object.entries(v.criteria ?? {}).map(([k, val]) => `${k}=${String(val)}`).join('  •  ') || 'no filters'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => onApply(v)}>Apply</Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => setDeleteViewId(v.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Scheduled exports */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              </span>
              Scheduled exports
            </CardTitle>
            <CardDescription className="text-xs">
              Recurring CSV exports of any report. Each run notifies recipients with SchoolDesk accounts.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              New schedule
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {exports.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (exports.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={CalendarClock} title="No scheduled exports" description="Create a schedule to keep stakeholders updated with fresh CSV reports." compact className="border-0" />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.data!.items.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.label ?? e.reportKey} • {e.format}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">{e.frequency}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-xs text-muted-foreground" title={e.recipients.join(', ')}>
                          {e.recipients.join(', ')}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.lastRunAt ? format(new Date(e.lastRunAt), 'd MMM yy, HH:mm') : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Switch
                            checked={e.active}
                            disabled={!canWrite || toggleExport.isPending}
                            onCheckedChange={v => toggleExport.mutate({ id: e.id, active: v })}
                            aria-label={e.active ? `Pause ${e.name}` : `Activate ${e.name}`}
                          />
                          <Button
                            variant="outline" size="sm"
                            disabled={!canWrite || !e.active || runExport.isPending}
                            onClick={() => runExport.mutate(e.id)}
                          >
                            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', runExport.isPending && 'animate-spin')} aria-hidden />
                            Run now
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            aria-label={`Delete schedule ${e.name}`}
                            disabled={!canWrite}
                            onClick={() => setDeleteExportId(e.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create schedule dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New scheduled export</DialogTitle>
            <DialogDescription>Runs the report and emails in-app notifications to recipients each cycle.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!form.name.trim() || !form.recipients.trim()) return
              createExport.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="exp-name">Schedule name</Label>
              <Input id="exp-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly attendance digest" maxLength={80} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Report</Label>
                <Select value={form.reportKey} onValueChange={v => setForm(f => ({ ...f, reportKey: v }))}>
                  <SelectTrigger aria-label="Report"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger aria-label="Frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-recipients">Recipients (emails, comma separated)</Label>
              <Input
                id="exp-recipients" type="text" inputMode="email" multiple
                value={form.recipients}
                onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
                placeholder="bursar@schooldesk.ng, principal@schooldesk.ng"
                required
              />
              <p className="text-xs text-muted-foreground">
                <FileDown className="mr-1 inline h-3 w-3" aria-hidden />
                CSV format. Recipients without a SchoolDesk account are flagged when the export runs.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createExport.isPending || !form.name.trim() || !form.recipients.trim()}>
                {createExport.isPending ? 'Creating…' : 'Create schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteViewId !== null}
        onOpenChange={o => { if (!o) setDeleteViewId(null) }}
        title="Delete saved view?"
        description="This view will be removed for you. Other users' views are not affected."
        confirmLabel="Delete view"
        destructive
        onConfirm={async () => { if (deleteViewId) deleteView.mutate(deleteViewId) }}
      />
      <ConfirmDialog
        open={deleteExportId !== null}
        onOpenChange={o => { if (!o) setDeleteExportId(null) }}
        title="Delete scheduled export?"
        description="Recipients will stop receiving this report."
        confirmLabel="Delete schedule"
        destructive
        onConfirm={async () => { if (deleteExportId) deleteExport.mutate(deleteExportId) }}
      />
    </div>
  )
}
