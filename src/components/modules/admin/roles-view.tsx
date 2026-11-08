'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, Lock, Pencil, ShieldCheck } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'

interface RoleItem {
  name: string
  permissions: string[]
  isSystem: boolean
}

interface RolesResponse {
  items: RoleItem[]
  defaults: Record<string, string[]>
  allPermissions: string[]
}

const MODULE_LABELS: Record<string, string> = {
  students: 'Students',
  admissions: 'Admissions',
  academic: 'Academic',
  timetable: 'Timetable',
  attendance: 'Attendance',
  exams: 'Exams',
  assignments: 'Homework',
  fees: 'Fees',
  accounts: 'Accounts',
  hr: 'HR',
  inventory: 'Inventory',
  communication: 'Communication',
  reports: 'Reports',
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',
  school: 'School',
  audit: 'Audit',
  portal: 'Portal',
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function moduleLabel(mod: string): string {
  return MODULE_LABELS[mod] ?? titleCase(mod)
}

function groupByModule(perms: string[]): { module: string; perms: string[] }[] {
  const map = new Map<string, string[]>()
  for (const p of perms) {
    const mod = p.includes('.') ? p.split('.')[0] : p
    const list = map.get(mod) ?? []
    list.push(p)
    map.set(mod, list)
  }
  return [...map.entries()].map(([module, list]) => ({ module, perms: list }))
}

function RoleEditDialog({
  role, allPermissions, onOpenChange,
}: {
  role: RoleItem | null
  allPermissions: string[]
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  // State is initialized from props; the parent re-mounts this dialog via `key` when the role changes.
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

  const groups = useMemo(() => groupByModule(allPermissions), [allPermissions])

  const toggle = (p: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(p)
      else next.delete(p)
      return next
    })
  }

  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {titleCase(role?.name ?? '')} permissions</DialogTitle>
          <DialogDescription>
            {selected.size} of {allPermissions.length} selected — &apos;*.read&apos; style wildcards are allowed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {groups.map(g => (
            <section key={g.module} aria-label={moduleLabel(g.module)} className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{moduleLabel(g.module)}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.perms.map(p => (
                  <Label
                    key={p}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm font-normal transition-colors has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox checked={selected.has(p)} onCheckedChange={v => toggle(p, v === true)} />
                    <span className="truncate font-mono text-xs">{p}</span>
                  </Label>
                ))}
              </div>
            </section>
          ))}
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

export function RolesView() {
  const canEdit = useSession(s => s.can('roles.write'))
  const [editing, setEditing] = useState<RoleItem | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: qk.roles,
    queryFn: () => api<RolesResponse>('/roles'),
  })

  const roles = data?.items ?? []
  const allPermissions = data?.allPermissions ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Roles & Permissions"
        description="Role-based access control — decide what each role can see and do in SchoolDesk."
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map(role => {
            const isAdmin = role.name === 'ADMIN'
            const preview = role.permissions.slice(0, 4)
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
                  <p className="text-xs text-muted-foreground">
                    {role.permissions.length} of {allPermissions.length} permissions
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

      <RoleEditDialog
        key={editing?.name ?? 'closed'}
        role={editing}
        allPermissions={allPermissions}
        onOpenChange={o => { if (!o) setEditing(null) }}
      />
    </motion.div>
  )
}
