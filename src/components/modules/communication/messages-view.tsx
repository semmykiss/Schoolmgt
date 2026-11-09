'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AtSign, Loader2, MessageSquareText, Pencil, Plus, Send, Smartphone, Trash2, Users,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FieldError } from '@/components/shared/field-error'
import { StatCard } from '@/components/shared/stat-card'

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP'
type AudienceType = 'ALL_STAFF' | 'ALL_PARENTS' | 'ALL_STUDENTS' | 'CLASS' | 'CUSTOM'

interface TemplateRow {
  id: string
  name: string
  channel: Channel
  subject: string | null
  body: string
}
interface LogRow {
  id: string
  channel: Channel
  recipient: string
  subject: string | null
  body: string
  status: string // QUEUED | SENT | FAILED | SIMULATED
  provider: string | null
  error: string | null
  sentAt: string | null
  createdAt: string
}
interface ClassRow { id: string; name: string }
interface SendOutcome {
  requested: number
  delivered: number
  simulated: number
  failed: number
}

const CHANNEL_LABEL: Record<Channel, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp' }
const AUDIENCE_LABEL: Record<AudienceType, string> = {
  ALL_STAFF: 'All staff',
  ALL_PARENTS: 'All parents',
  ALL_STUDENTS: 'All students (portal accounts)',
  CLASS: 'One class (students + parents)',
  CUSTOM: 'Pick recipients later',
}
const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  SIMULATED: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  FAILED: 'bg-destructive/15 text-destructive',
  QUEUED: 'bg-muted text-muted-foreground',
}

const PLACEHOLDERS = ['{{school}}', '{{name}}', '{{student}}', '{{date}}']

// ── Compose tab ─────────────────────────────────────────────────────────────
function ComposeTab() {
  const qc = useQueryClient()
  const [channel, setChannel] = useState<Channel>('SMS')
  const [templateId, setTemplateId] = useState('NONE')
  const [audienceType, setAudienceType] = useState<AudienceType>('ALL_PARENTS')
  const [classId, setClassId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []

  const { data: templatesData } = useQuery({
    queryKey: qk.templates({ channel }),
    queryFn: () => api<{ items: TemplateRow[] }>('/communication/templates', { query: { channel, pageSize: 100 } }),
  })
  const templates = templatesData?.items ?? []

  const audience = {
    type: audienceType,
    classId: audienceType === 'CLASS' ? classId : undefined,
  }

  // Recipient estimate — TanStack refetches only when the targeting key changes
  const { data: previewData, isFetching: previewLoading } = useQuery({
    queryKey: ['communication', 'send-preview', channel, audienceType, classId],
    queryFn: () => api<{ count: number; sample: { recipient: string; name: string | null }[] }>('/communication/send/preview', {
      method: 'POST',
      body: { channel, audience, body: '…' },
    }),
    enabled: audienceType !== 'CLASS' || classId !== '',
    staleTime: 30_000,
  })

  const send = useMutation({
    mutationFn: () => api<SendOutcome>('/communication/send', {
      method: 'POST',
      body: { channel, audience, subject: channel === 'EMAIL' ? subject.trim() : undefined, body: body.trim() },
    }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['communication', 'logs'] })
      setConfirmOpen(false)
      toast.success(
        res.failed === 0
          ? `Broadcast queued for ${res.requested} recipient(s) — ${res.delivered} sent, ${res.simulated} simulated`
          : `Broadcast finished — ${res.delivered + res.simulated} accepted, ${res.failed} failed. Check the delivery log.`,
      )
      setBody(''); setSubject(''); setTemplateId('NONE')
    },
    onError: err => { setConfirmOpen(false); toast.error(err instanceof Error ? err.message : 'Broadcast failed') },
  })

  const recipientCount = previewData?.count ?? 0
  const valid = body.trim().length > 0 && (audienceType !== 'CLASS' || classId !== '') && (channel !== 'EMAIL' || subject.trim().length > 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={v => { setChannel(v as Channel); setTemplateId('NONE'); setError(undefined) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2">
                      {c === 'EMAIL' ? <AtSign className="h-3.5 w-3.5" aria-hidden /> : <Smartphone className="h-3.5 w-3.5" aria-hidden />}
                      {CHANNEL_LABEL[c]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Template <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select
              value={templateId}
              onValueChange={v => {
                setTemplateId(v)
                setError(undefined)
                if (v !== 'NONE') {
                  const t = templates.find(x => x.id === v)
                  if (t) { setSubject(t.subject ?? ''); setBody(t.body) }
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={templates.length === 0 ? 'No templates yet' : 'Start from a template'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Write from scratch</SelectItem>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select value={audienceType} onValueChange={v => { setAudienceType(v as AudienceType); setError(undefined) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABEL) as AudienceType[]).filter(a => a !== 'CUSTOM').map(a => (
                  <SelectItem key={a} value={a}>{AUDIENCE_LABEL[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {audienceType === 'CLASS' && (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={classes.length === 0 ? 'No classes yet' : 'Choose class'} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {channel === 'EMAIL' && (
          <div className="space-y-1.5">
            <Label htmlFor="msg-subject">Subject</Label>
            <Input
              id="msg-subject" value={subject} maxLength={200}
              onChange={e => { setSubject(e.target.value); setError(undefined) }}
              placeholder="e.g. Fee payment reminder"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="msg-body">Message</Label>
          <Textarea
            id="msg-body" value={body} rows={6} maxLength={8000}
            onChange={e => { setBody(e.target.value); setError(undefined) }}
            placeholder={channel === 'EMAIL' ? 'Write the email body…' : 'Keep SMS concise — long texts cost more segments…'}
          />
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-xs text-muted-foreground">Insert:</span>
            {PLACEHOLDERS.map(p => (
              <button
                key={p} type="button"
                onClick={() => setBody(b => `${b}${p}`)}
                className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {p}
              </button>
            ))}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{body.length}/8000</span>
          </div>
        </div>

        <FieldError message={error} />

        <div className="flex items-center gap-3">
          <Button
            onClick={() => (valid ? setConfirmOpen(true) : setError('Write a message' + (audienceType === 'CLASS' ? ' and pick a class' : '') + (channel === 'EMAIL' ? ' plus a subject' : '')))}
            disabled={send.isPending}
          >
            {send.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Send broadcast
          </Button>
          <p className="text-sm text-muted-foreground">
            {previewLoading
              ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> counting…</span>
              : <>≈ <span className="font-medium tabular-nums text-foreground">{recipientCount}</span> recipient{recipientCount === 1 ? '' : 's'}</>}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="mb-2 flex items-center gap-1.5 font-medium">
            <Users className="h-4 w-4 text-primary" aria-hidden /> Who receives this
          </p>
          <p className="text-muted-foreground">
            {audienceType === 'ALL_PARENTS' && 'Every guardian with a phone number or email on file. Duplicate contacts are merged.'}
            {audienceType === 'ALL_STAFF' && 'All active employees — contact details come from their staff records.'}
            {audienceType === 'ALL_STUDENTS' && 'Students with portal logins, falling back to their guardians\' contacts.'}
            {audienceType === 'CLASS' && 'Students in the selected class plus their guardians.'}
          </p>
          {previewData?.sample && previewData.sample.length > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-2.5 text-xs text-muted-foreground">
              {previewData.sample.map((s, i) => (
                <li key={`${s.recipient}-${i}`} className="truncate">
                  <span className="text-foreground">{s.name ?? 'Recipient'}</span> · {s.recipient}
                </li>
              ))}
              {previewData.count > previewData.sample.length && (
                <li className="italic">+ {previewData.count - previewData.sample.length} more…</li>
              )}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Sandbox delivery</p>
          <p className="mt-1">
            The demo school runs the mock driver, so messages are logged with status
            {' '}<Badge variant="secondary" className={cn('h-5 px-1.5 text-[10px]', STATUS_STYLE.SIMULATED)}>SIMULATED</Badge>{' '}
            instead of hitting Termii/Sendgrid. Configure API keys in School Settings to go live.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Send this ${CHANNEL_LABEL[channel]} broadcast?`}
        description={`≈ ${recipientCount} recipient(s) will receive this message through the ${CHANNEL_LABEL[channel]} channel. This cannot be undone.`}
        confirmLabel={`Send to ${recipientCount}`}
        onConfirm={async () => { await send.mutateAsync() }}
      />
    </div>
  )
}

// ── Templates tab ───────────────────────────────────────────────────────────
function TemplateDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: TemplateRow | null
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [channel, setChannel] = useState<Channel>(editing?.channel ?? 'SMS')
  const [subject, setSubject] = useState(editing?.subject ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [error, setError] = useState<string | undefined>()

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), channel, subject: subject.trim(), body: body.trim() }
      return editing
        ? api(`/communication/templates/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/communication/templates', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication', 'templates'] })
      toast.success(editing ? 'Template updated' : 'Template saved')
      onOpenChange(false)
    },
    onError: err => setError(err instanceof Error ? err.message : 'Could not save template'),
  })

  const valid = name.trim().length >= 3 && body.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>Reusable message blueprints — placeholders like {'{{student}}'} fill in per recipient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name" value={name} maxLength={80}
                onChange={e => { setName(e.target.value); setError(undefined) }}
                placeholder="e.g. Fee reminder"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => (
                    <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {channel === 'EMAIL' && (
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input id="tpl-subject" value={subject} maxLength={200} onChange={e => setSubject(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Body</Label>
            <Textarea
              id="tpl-body" value={body} rows={5} maxLength={8000}
              onChange={e => { setBody(e.target.value); setError(undefined) }}
              placeholder={'Dear {{name}},\n\nThis is a reminder that {{student}}\'s fees…'}
            />
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map(p => (
                <button
                  key={p} type="button"
                  onClick={() => setBody(b => `${b}${p}`)}
                  className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => (valid ? save.mutate() : setError('Add a name (3+ characters) and a body'))}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? 'Save changes' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplatesTab() {
  const canWrite = useSession(s => s.can('communication.templates.write'))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [removeTarget, setRemoveTarget] = useState<TemplateRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.templates({}),
    queryFn: () => api<{ items: TemplateRow[] }>('/communication/templates', { query: { pageSize: 100 } }),
  })
  const templates = data?.items ?? []

  const remove = useMutation({
    mutationFn: (id: string) => api(`/communication/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Template deleted'),
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<TemplateRow, unknown>[]>(() => [
    {
      id: 'name', accessorFn: r => r.name, header: 'Template', meta: { label: 'Template' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</p>
        </div>
      ),
    },
    {
      id: 'channel', accessorFn: r => r.channel, header: 'Channel', meta: { label: 'Channel' },
      cell: ({ getValue }) => <Badge variant="outline">{CHANNEL_LABEL[getValue() as Channel] ?? String(getValue())}</Badge>,
    },
    {
      id: 'subject', accessorFn: r => r.subject ?? '—', header: 'Subject', meta: { label: 'Subject' },
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{String(getValue())}</span>,
    },
    ...(canWrite ? [{
      id: 'actions',
      header: '',
      enableSorting: false as const,
      enableHiding: false as const,
      meta: { label: 'Actions' },
      cell: ({ row }: { row: { original: TemplateRow } }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            aria-label={`Edit ${row.original.name}`}
            onClick={() => { setEditing(row.original); setDialogOpen(true) }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Delete ${row.original.name}`}
            onClick={() => setRemoveTarget(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    }] : []),
  ], [canWrite])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus aria-hidden /> New template
          </Button>
        )}
      </div>
      <DataTable<TemplateRow>
        columns={columns}
        data={templates}
        loading={isLoading}
        rowId={t => t.id}
        searchPlaceholder="Search templates…"
        searchExtractor={t => `${t.name} ${t.subject ?? ''}`}
        initialPageSize={25}
        emptyState={
          <EmptyState
            icon={MessageSquareText}
            title="No templates yet"
            description="Save reusable messages — fee reminders, absence alerts, exam notices — and compose broadcasts in two clicks."
            action={canWrite ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> New template</Button>
            ) : undefined}
          />
        }
      />
      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={o => { if (!o) setRemoveTarget(null) }}
        title={`Delete "${removeTarget?.name ?? ''}"?`}
        description="Templates already sent are unaffected — only the reusable blueprint is removed."
        confirmLabel="Delete template" destructive
        onConfirm={async () => { if (removeTarget) await remove.mutateAsync(removeTarget.id) }}
      />
    </div>
  )
}

// ── Delivery log tab ────────────────────────────────────────────────────────
function LogsTab() {
  const [channelFilter, setChannelFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const { data, isLoading } = useQuery({
    queryKey: qk.commLogs({ channel: channelFilter, status: statusFilter }),
    queryFn: () => api<{ items: LogRow[]; total: number; statusCounts: Record<string, number> }>('/communication/logs', {
      query: {
        channel: channelFilter === 'ALL' ? undefined : channelFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        pageSize: 100,
      },
    }),
  })
  const logs = data?.items ?? []
  const counts = data?.statusCounts ?? {}

  const columns = useMemo<ColumnDef<LogRow, unknown>[]>(() => [
    {
      id: 'recipient', accessorFn: r => r.recipient, header: 'Recipient', meta: { label: 'Recipient' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{row.original.recipient}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.body}</p>
        </div>
      ),
    },
    {
      id: 'channel', accessorFn: r => r.channel, header: 'Channel', meta: { label: 'Channel' },
      cell: ({ getValue }) => <Badge variant="outline">{CHANNEL_LABEL[getValue() as Channel] ?? String(getValue())}</Badge>,
    },
    {
      id: 'status', accessorFn: r => r.status, header: 'Status', meta: { label: 'Status' },
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <Badge variant="secondary" className={STATUS_STYLE[row.original.status] ?? STATUS_STYLE.QUEUED}>
            {row.original.status}
          </Badge>
          {row.original.error && (
            <p className="max-w-48 truncate text-[11px] text-muted-foreground" title={row.original.error}>{row.original.error}</p>
          )}
        </div>
      ),
    },
    {
      id: 'provider', accessorFn: r => r.provider ?? '—', header: 'Provider', meta: { label: 'Provider' },
      cell: ({ getValue }) => <span className="text-sm capitalize text-muted-foreground">{String(getValue())}</span>,
    },
    {
      id: 'sentAt', accessorFn: r => r.sentAt ?? r.createdAt, header: 'When', meta: { label: 'When' },
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {new Date(String(getValue())).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </span>
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={Send} label="Total" value={(counts.SENT ?? 0) + (counts.SIMULATED ?? 0) + (counts.FAILED ?? 0)} />
        <StatCard icon={Send} label="Sent" value={counts.SENT ?? 0} tone="success" />
        <StatCard icon={Send} label="Simulated" value={counts.SIMULATED ?? 0} tone="warning" />
        <StatCard icon={Send} label="Failed" value={counts.FAILED ?? 0} tone="destructive" />
      </div>
      <DataTable<LogRow>
        columns={columns}
        data={logs}
        loading={isLoading}
        rowId={l => l.id}
        searchPlaceholder="Search recipient…"
        searchExtractor={l => `${l.recipient} ${l.subject ?? ''}`}
        initialPageSize={25}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger size="sm" className="w-32" aria-label="Filter by channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => (
                  <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-32" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {['SENT', 'SIMULATED', 'FAILED', 'QUEUED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
        emptyState={
          <EmptyState
            icon={Send}
            title="No messages sent yet"
            description="Every SMS, email and WhatsApp broadcast is logged here with its delivery status."
          />
        }
      />
    </div>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export function MessagesView() {
  const canWrite = useSession(s => s.can('communication.send'))
  const [tab, setTab] = useState('compose')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Message Centre</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          SMS, email and WhatsApp broadcasts to any audience — with reusable templates and a full delivery log
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="compose" className="gap-1.5"><Send className="h-3.5 w-3.5" aria-hidden /> Compose</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><MessageSquareText className="h-3.5 w-3.5" aria-hidden /> Templates</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><AtSign className="h-3.5 w-3.5" aria-hidden /> Delivery log</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4">
          {canWrite ? <ComposeTab /> : (
            <EmptyState
              icon={Send}
              title="Read-only access"
              description="Your role can view delivery logs but not send broadcasts. Ask an administrator for communication access."
            />
          )}
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
