'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Loader2, Megaphone, Pencil, Pin, PinOff, Plus, Rocket, Trash2, Undo2,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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

interface AnnouncementRow {
  id: string
  title: string
  body: string
  audience: string // ALL | STAFF | PARENTS | STUDENTS | CLASS
  classId: string | null
  pinned: boolean
  publishedAt: string | null
  startAt: string | null
  endAt: string | null
  class: { id: string; name: string } | null
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'Everyone', STAFF: 'Staff', PARENTS: 'Parents', STUDENTS: 'Students', CLASS: 'One class',
}

function prettyDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

// ── Compose / edit dialog ───────────────────────────────────────────────────
function AnnouncementDialog({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: AnnouncementRow | null
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [audience, setAudience] = useState(editing?.audience ?? 'ALL')
  const [classId, setClassId] = useState(editing?.classId ?? '')
  const [pinned, setPinned] = useState(editing?.pinned ?? false)
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
        title: title.trim(), body: body.trim(), audience,
        classId: audience === 'CLASS' ? classId : null, pinned,
      }
      return editing
        ? api(`/communication/announcements/${editing.id}`, { method: 'PATCH', body: payload })
        : api('/communication/announcements', { method: 'POST', body: payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communication', 'announcements'] })
      toast.success(editing ? 'Announcement updated' : 'Draft saved — publish it to notify its audience')
      onOpenChange(false)
    },
    onError: err => setError(err instanceof Error ? err.message : 'Could not save announcement'),
  })

  const valid = title.trim().length >= 3 && body.trim().length > 0 && (audience !== 'CLASS' || classId !== '')

  return (
    <Dialog open={open} onOpenChange={o => { if (!save.isPending) onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>
            Drafts stay private. Publishing notifies the selected audience in-app and shows it on their portal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title" value={title} maxLength={160}
              onChange={e => { setTitle(e.target.value); setError(undefined) }}
              placeholder="e.g. Second Term PTA Meeting"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea
              id="ann-body" value={body} rows={5} maxLength={8000}
              onChange={e => { setBody(e.target.value); setError(undefined) }}
              placeholder="What should the school community know?"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            {audience === 'CLASS' && (
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
          <div className="flex items-center gap-2">
            <Switch id="ann-pin" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="ann-pin" className="font-normal">Pin to the top of portals</Label>
          </div>
          <FieldError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => (valid ? save.mutate() : setError('Add a title (3+ characters), a message' + (audience === 'CLASS' ? ' and a class' : '')))}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────
export function AnnouncementsView() {
  const qc = useQueryClient()
  const canWrite = useSession(s => s.can('communication.announcements.write'))
  const canPublish = useSession(s => s.can('communication.announcements.publish'))
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementRow | null>(null)
  const [removeTarget, setRemoveTarget] = useState<AnnouncementRow | null>(null)
  const [publishTarget, setPublishTarget] = useState<AnnouncementRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.announcements({ status: statusFilter === 'ALL' ? undefined : statusFilter }),
    queryFn: () => api<{ items: AnnouncementRow[] }>('/communication/announcements', {
      query: { status: statusFilter === 'ALL' ? undefined : statusFilter.toLowerCase(), pageSize: 100 },
    }),
  })
  const announcements = data?.items ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['communication', 'announcements'] })
    qc.invalidateQueries({ queryKey: qk.notifications })
  }

  const publish = useMutation({
    mutationFn: (id: string) => api<{ notified: number }>(`/communication/announcements/${id}/publish`, { method: 'POST' }),
    onSuccess: res => {
      invalidate()
      toast.success(`Published — ${res.notified} people notified`)
      setPublishTarget(null)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Publish failed'),
  })
  const unpublish = useMutation({
    mutationFn: (row: AnnouncementRow) => api(`/communication/announcements/${row.id}`, { method: 'PATCH', body: { published: false } }),
    onSuccess: () => { invalidate(); toast.success('Moved back to drafts') },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not unpublish'),
  })
  const togglePin = useMutation({
    mutationFn: (row: AnnouncementRow) => api(`/communication/announcements/${row.id}`, { method: 'PATCH', body: { pinned: !row.pinned } }),
    onSuccess: () => invalidate(),
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not update pin'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/communication/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Announcement deleted') },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const stats = useMemo(() => {
    const published = announcements.filter(a => a.publishedAt).length
    const drafts = announcements.length - published
    const pinned = announcements.filter(a => a.pinned).length
    return { published, drafts, pinned }
  }, [announcements])

  const columns = useMemo<ColumnDef<AnnouncementRow, unknown>[]>(() => [
    {
      id: 'title',
      accessorFn: r => r.title,
      header: 'Announcement',
      meta: { label: 'Announcement' },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-start gap-2">
          {row.original.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-label="Pinned" />}
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'audience',
      accessorFn: r => r.audience,
      header: 'Audience',
      meta: { label: 'Audience' },
      cell: ({ row }) => (
        <Badge variant="outline">
          {AUDIENCE_LABEL[row.original.audience] ?? row.original.audience}
          {row.original.class ? ` · ${row.original.class.name}` : ''}
        </Badge>
      ),
    },
    {
      id: 'status',
      accessorFn: r => (r.publishedAt ? 'Published' : 'Draft'),
      header: 'Status',
      meta: { label: 'Status' },
      cell: ({ row }) => row.original.publishedAt
        ? (
          <Badge variant="secondary" className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
            Published {row.original.publishedAt ? `· ${prettyDateTime(row.original.publishedAt)}` : ''}
          </Badge>
        )
        : <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Draft</Badge>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const a = row.original
        if (!canWrite && !canPublish) return null
        return (
          <div className="flex items-center gap-1">
            {a.publishedAt ? (
              canPublish && (
                <Button
                  variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs"
                  aria-label={`Unpublish ${a.title}`}
                  onClick={() => unpublish.mutate(a)}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden /> Unpublish
                </Button>
              )
            ) : (
              canPublish && (
                <Button
                  variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-primary hover:text-primary"
                  aria-label={`Publish ${a.title}`}
                  onClick={() => setPublishTarget(a)}
                >
                  <Rocket className="h-3.5 w-3.5" aria-hidden /> Publish
                </Button>
              )
            )}
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              aria-label={a.pinned ? `Unpin ${a.title}` : `Pin ${a.title}`}
              onClick={() => togglePin.mutate(a)}
            >
              {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              aria-label={`Edit ${a.title}`}
              onClick={() => { setEditing(a); setDialogOpen(true) }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={`Delete ${a.title}`}
              onClick={() => setRemoveTarget(a)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], [canWrite, canPublish, publish, unpublish, togglePin])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Announcements</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Broadcast news to staff, parents and students — pinned posts lead their portals
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus aria-hidden /> New announcement
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Megaphone} label="Published" value={stats.published} tone="primary" />
        <StatCard icon={Pencil} label="Drafts" value={stats.drafts} />
        <StatCard icon={Pin} label="Pinned" value={stats.pinned} />
      </div>

      <DataTable<AnnouncementRow>
        columns={columns}
        data={announcements}
        loading={isLoading}
        rowId={a => a.id}
        searchPlaceholder="Search announcements…"
        searchExtractor={a => `${a.title} ${a.body}`}
        initialPageSize={25}
        toolbar={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="DRAFT">Drafts</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyState={
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            description="Keep families and staff in the loop — publish term dates, PTA meetings and closures. Audiences get an in-app notification instantly."
            action={canWrite ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus aria-hidden /> New announcement</Button>
            ) : undefined}
          />
        }
      />

      <AnnouncementDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={o => { if (!o) setPublishTarget(null) }}
        title={`Publish "${publishTarget?.title ?? ''}"?`}
        description={cn(
          'Everyone in the audience',
          publishTarget?.audience === 'CLASS' && publishTarget?.class ? ` (${publishTarget.class.name})` : '',
          ' gets an in-app notification immediately, and the post appears on their portal.',
        )}
        confirmLabel="Publish now"
        onConfirm={async () => { if (publishTarget) await publish.mutateAsync(publishTarget.id) }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={o => { if (!o) setRemoveTarget(null) }}
        title={`Delete "${removeTarget?.title ?? ''}"?`}
        description="This removes the announcement everywhere — portals, feeds and history."
        confirmLabel="Delete announcement" destructive
        onConfirm={async () => { if (removeTarget) await remove.mutateAsync(removeTarget.id) }}
      />
    </motion.div>
  )
}
