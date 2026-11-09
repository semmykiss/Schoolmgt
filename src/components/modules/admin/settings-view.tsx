'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  DatabaseBackup, Download, Globe, Languages, Palette, Plus, Save, School as SchoolIcon, Trash2,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession, type SessionSchool } from '@/stores/session'
import { LOCALES, t, type I18nKey } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PageHeader } from '@/components/shared/page-header'

interface SchoolProfile extends SessionSchool {
  locale: string | null
  timezone: string
}

interface BackupRow {
  name: string
  sizeBytes: number
  createdAt: string
}

const PREVIEW_KEYS: I18nKey[] = [
  'dashboard', 'students', 'staff', 'attendance', 'fees', 'exams',
  'reports', 'settings', 'calendar', 'homework', 'library', 'announcements',
]

function humanSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function SettingsView() {
  const canEditSchool = useSession(s => s.can('school.write'))
  const canBackups = useSession(s => s.can('settings.write'))
  const refreshSession = useSession(s => s.refresh)
  const queryClient = useQueryClient()

  const school = useQuery({
    queryKey: ['school', 'profile'],
    queryFn: () => api<SchoolProfile>('/school'),
  })

  const [form, setForm] = useState<Partial<SchoolProfile>>({})

  useEffect(() => {
    if (school.data) setForm(school.data)
  }, [school.data])

  const saveSchool = useMutation({
    mutationFn: () =>
      api('/school', {
        method: 'PATCH',
        body: {
          name: form.name,
          type: form.type,
          motto: form.motto ?? null,
          phone: form.phone ?? null,
          email: form.email ?? null,
          address: form.address ?? null,
          city: form.city ?? null,
          state: form.state ?? null,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          locale: form.locale ?? 'en',
        },
      }),
    onSuccess: async () => {
      toast.success('School settings saved')
      await refreshSession()
      void queryClient.invalidateQueries({ queryKey: ['school', 'profile'] })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  // ── Backups ──────────────────────────────────────────────────────────────
  const backups = useQuery({
    queryKey: qk.backups,
    queryFn: () => api<{ items: BackupRow[]; dbFile: string }>('/admin/backup'),
  })

  const createBackup = useMutation({
    mutationFn: () => api<BackupRow>('/admin/backup', { method: 'POST' }),
    onSuccess: file => {
      toast.success(`Backup created — ${file.name}`)
      void queryClient.invalidateQueries({ queryKey: qk.backups })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Backup failed'),
  })

  const [deleteName, setDeleteName] = useState<string | null>(null)
  const deleteBackup = useMutation({
    mutationFn: (name: string) => api(`/admin/backup/${name}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Backup deleted')
      void queryClient.invalidateQueries({ queryKey: qk.backups })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const downloadBackup = async (name: string) => {
    try {
      const res = await fetch(`/api/v1/admin/backup/${name}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download backup')
    }
  }

  const locale = form.locale ?? 'en'

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <PageHeader
        title="School Settings"
        description="Profile, branding, localisation and database backups"
      />

      {/* Profile + branding */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SchoolIcon className="h-3.5 w-3.5" aria-hidden />
              </span>
              School profile
            </CardTitle>
            <CardDescription className="text-xs">Appears on receipts, report cards, ID cards and the parent portal.</CardDescription>
          </CardHeader>
          <CardContent>
            {school.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={e => { e.preventDefault(); if (canEditSchool) saveSchool.mutate() }}
              >
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="s-name">School name</Label>
                  <Input id="s-name" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={!canEditSchool} required minLength={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-type">Type</Label>
                  <Select value={form.type ?? 'SCHOOL'} onValueChange={v => setForm(f => ({ ...f, type: v }))} disabled={!canEditSchool}>
                    <SelectTrigger id="s-type" aria-label="School type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCHOOL">School</SelectItem>
                      <SelectItem value="COLLEGE">College</SelectItem>
                      <SelectItem value="TUITION_CENTRE">Tuition centre</SelectItem>
                      <SelectItem value="ACADEMY">Academy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-motto">Motto</Label>
                  <Input id="s-motto" value={form.motto ?? ''} onChange={e => setForm(f => ({ ...f, motto: e.target.value }))} disabled={!canEditSchool} placeholder="Knowledge • Character • Service" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-phone">Phone</Label>
                  <Input id="s-phone" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} disabled={!canEditSchool} placeholder="+234 802 000 0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-email">Email</Label>
                  <Input id="s-email" type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} disabled={!canEditSchool} placeholder="info@schooldesk.ng" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-city">City</Label>
                  <Input id="s-city" value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!canEditSchool} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-state">State</Label>
                  <Input id="s-state" value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} disabled={!canEditSchool} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="s-address">Address</Label>
                  <Input id="s-address" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} disabled={!canEditSchool} />
                </div>
                {canEditSchool && (
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={saveSchool.isPending}>
                      <Save className="mr-2 h-4 w-4" aria-hidden />
                      {saveSchool.isPending ? 'Saving…' : 'Save profile'}
                    </Button>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Branding preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-3.5 w-3.5" aria-hidden />
                </span>
                Branding
              </CardTitle>
              <CardDescription className="text-xs">Brand colours used across printed documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="rounded-xl p-5 text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${form.primaryColor ?? '#0F766E'}, ${form.secondaryColor ?? '#D97706'})` }}
              >
                <p className="text-lg font-bold leading-tight">{form.name ?? 'Your School'}</p>
                {form.motto && <p className="mt-1 text-xs opacity-90">{form.motto}</p>}
                <p className="mt-3 text-[11px] uppercase tracking-wider opacity-80">
                  {[form.city, form.state].filter(Boolean).join(', ') || 'Nigeria'}
                </p>
              </div>
              {canEditSchool && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-primary" className="text-xs text-muted-foreground">Primary</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="s-primary" type="color" value={form.primaryColor ?? '#0F766E'}
                        onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                        className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                        aria-label="Primary colour"
                      />
                      <Input value={form.primaryColor ?? '#0F766E'} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="h-9 font-mono text-xs" aria-label="Primary colour hex" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-secondary" className="text-xs text-muted-foreground">Secondary</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="s-secondary" type="color" value={form.secondaryColor ?? '#D97706'}
                        onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                        className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                        aria-label="Secondary colour"
                      />
                      <Input value={form.secondaryColor ?? '#D97706'} onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))} className="h-9 font-mono text-xs" aria-label="Secondary colour hex" />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Language & region */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Languages className="h-3.5 w-3.5" aria-hidden />
                </span>
                Language
              </CardTitle>
              <CardDescription className="text-xs">Core interface strings — starter packs, English is the source of truth.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={locale}
                onValueChange={v => setForm(f => ({ ...f, locale: v }))}
                disabled={!canEditSchool}
              >
                <SelectTrigger className="h-9" aria-label="Interface language">
                  <Globe className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.native} ({l.label})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {PREVIEW_KEYS.map(key => (
                  <li key={key} className="flex items-center justify-between border-b border-dashed py-1">
                    <span className="text-xs text-muted-foreground">{t('en', key)}</span>
                    <span className="text-xs font-medium">{t(locale, key)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Backups */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DatabaseBackup className="h-3.5 w-3.5" aria-hidden />
              </span>
              Database backups
            </CardTitle>
            <CardDescription className="text-xs">
              Snapshot of the SQLite database{backups.data?.dbFile ? ` (${backups.data.dbFile})` : ''} — download and keep off-site copies.
            </CardDescription>
          </div>
          {canBackups && (
            <Button size="sm" onClick={() => createBackup.mutate()} disabled={createBackup.isPending}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {createBackup.isPending ? 'Creating…' : 'Create backup'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {backups.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (backups.data?.items.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No backups yet — take the first snapshot.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {backups.data!.items.map(b => (
                <li key={b.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(b.createdAt), 'd MMM yyyy, HH:mm')} • {humanSize(b.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">.db</Badge>
                    <Button variant="outline" size="sm" onClick={() => downloadBackup(b.name)}>
                      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Download
                    </Button>
                    {canBackups && (
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        aria-label={`Delete backup ${b.name}`}
                        onClick={() => setDeleteName(b.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteName !== null}
        onOpenChange={o => { if (!o) setDeleteName(null) }}
        title="Delete this backup?"
        description="The snapshot file will be removed from the server. Downloaded copies are unaffected."
        confirmLabel="Delete backup"
        destructive
        onConfirm={async () => { if (deleteName) deleteBackup.mutate(deleteName) }}
      />
    </motion.div>
  )
}
