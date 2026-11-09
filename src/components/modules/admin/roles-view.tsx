'use client'

import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, Loader2, Lock, Minus, Pencil, ShieldCheck } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { can } from '@/lib/auth/permissions-client'
import { PERMISSION_CATALOG, PERMISSION_MODULES } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'

interface RoleItem {
  name: string
  permissions: string[]
  isSystem: boolean
  hasOverrides?: boolean
}

interface RolesResponse {
  items: RoleItem[]
  defaults: Record<string, string[]>
  allPermissions: string[]
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

const ROLE_BLURB: Record<string, string> = {
  ADMIN: 'Full, unrestricted access to every module.',
  PRINCIPAL: 'Runs the school day-to-day — academics, exams, communication and leave approvals.',
  TEACHER: 'Teaches: attendance, marks, homework and self-service leave.',
  ACCOUNTANT: 'Owns the money: fees, payments and the ledger.',
  LIBRARIAN: 'Library and inventory duties.',
  HR: 'Staff records, payroll runs and leave management.',
  PARENT: 'Portal view of their children only.',
  STUDENT: 'Portal view of their own record only.',
}

const CATALOG_BY_MODULE = PERMISSION_MODULES.map(m => ({
  ...m,
  entries: PERMISSION_CATALOG.filter(p => p.module === m.key),
}))

// ── Edit dialog (granular, grouped by module) ───────────────────────────────

function RoleEditDialog({
  role, onOpenChange,
}: {
  role: RoleItem | null
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  // State is initialized from props; the parent re-mounts this dialog via `key`.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []))

  const save = useMutation({
    mutationFn: () => api(`/roles/${role?.name ?? ''}`, { method: 'PATCH', body: { permissions: [...selected] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roles })
      toast.success(`Permissions updated for ${titleCase(role?.name ?? 'role')}`)
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const toggle = (p: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(p)
      else next.delete(p)
      return next
    })
  }

  const moduleState = (keys: string[]) => {
    const on = keys.filter(k => selected.has(k)).length
    return on === 0 ? 'off' : on === keys.length ? 'on' : 'partial'
  }

  const toggleModule = (keys: string[]) => {
    setSelected(prev => {
      const next = new Set(prev)
      const allOn = keys.every(k => next.has(k))
      for (const k of keys) {
        if (allOn) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }

  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {titleCase(role?.name ?? '')} permissions</DialogTitle>
          <DialogDescription>
            {selected.size} of {PERMISSION_CATALOG.length} granular permissions selected. Changes apply immediately after saving.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-5 overflow-y-auto pr-1">
          {CATALOG_BY_MODULE.map(g => {
            const keys = g.entries.map(e => e.key)
            const state = moduleState(keys)
            return (
              <section key={g.key} aria-label={g.label} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => toggleModule(keys)}
                    aria-label={`Toggle all ${g.label} permissions`}
                  >
                    {state === 'on' ? 'Clear all' : state === 'partial' ? 'Select all' : 'Select all'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.entries.map(p => (
                    <Label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.has(p.key)}
                        onCheckedChange={v => toggle(p.key, v === true)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.label}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{p.key}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{p.description}</span>
                      </span>
                    </Label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Matrix tab ──────────────────────────────────────────────────────────────

function PermissionMatrix({ roles }: { roles: RoleItem[] }) {
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">Permission matrix — roles against every granular permission</caption>
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Permission
                </th>
                {roles.map(r => (
                  <th key={r.name} scope="col" className="px-3 py-2.5 text-center text-xs font-semibold">
                    {titleCase(r.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATALOG_BY_MODULE.map(g => (
                <Fragment key={g.key}>
                  <tr className="border-b bg-muted/20">
                    <th scope="colgroup" colSpan={roles.length + 1} className="px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {g.label}
                    </th>
                  </tr>
                  {g.entries.map(p => (
                    <tr key={p.key} className="border-b transition-colors hover:bg-muted/30">
                      <th scope="row" className="sticky left-0 z-10 max-w-64 bg-background px-4 py-2 text-left font-normal">
                        <span className="block truncate text-sm">{p.label}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{p.key}</span>
                      </th>
                      {roles.map(r => {
                        const has = r.name === 'ADMIN' || can(r.permissions, p.key)
                        return (
                          <td key={`${r.name}-${p.key}`} className="px-3 py-2 text-center">
                            {has
                              ? <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label={`${r.name} has ${p.key}`} />
                              : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label={`${r.name} lacks ${p.key}`} />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── View ────────────────────────────────────────────────────────────────────

export function RolesView() {
  const canEdit = useSession(s => s.can('roles.write'))
  const [editing, setEditing] = useState<RoleItem | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: qk.roles,
    queryFn: () => api<RolesResponse>('/roles'),
  })

  const roles = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => {
      const order = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'HR', 'LIBRARIAN', 'PARENT', 'STUDENT']
      return order.indexOf(a.name) - order.indexOf(b.name)
    }),
    [data],
  )
  const allCount = PERMISSION_CATALOG.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Roles & Permissions"
        description={`${allCount} granular permissions across ${PERMISSION_MODULES.length} modules — decide exactly what each role can see and do.`}
      />

      <Tabs defaultValue="roles" className="gap-4">
        <TabsList>
          <TabsTrigger value="roles" className="gap-1.5"><ShieldCheck className="h-4 w-4" /> Roles</TabsTrigger>
          <TabsTrigger value="matrix" className="gap-1.5">Permission matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-2">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roles.map(role => {
                const isAdmin = role.name === 'ADMIN'
                const preview = role.permissions.slice(0, 3)
                const extra = role.permissions.length - preview.length
                return (
                  <Card key={role.name} className="gap-4">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{titleCase(role.name)}</span>
                        {role.isSystem && <Badge variant="secondary" className="text-[10px] uppercase">system</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {ROLE_BLURB[role.name] ?? 'Custom role.'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isAdmin ? 'Full access' : `${role.permissions.length} of ${allCount} permissions`}
                        {role.hasOverrides && ' · customised'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.map(p => (
                          <span key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {p}
                          </span>
                        ))}
                        {extra > 0 && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">+{extra} more</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end border-t pt-3">
                        {isAdmin ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" aria-hidden /> Full access, locked
                          </span>
                        ) : canEdit ? (
                          <Button variant="outline" size="sm" onClick={() => setEditing(role)}>
                            <Pencil aria-hidden /> Edit
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-2">
          {isLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <PermissionMatrix roles={roles} />
          )}
        </TabsContent>
      </Tabs>

      <RoleEditDialog
        key={editing?.name ?? 'closed'}
        role={editing}
        onOpenChange={o => { if (!o) setEditing(null) }}
      />
    </motion.div>
  )
}
