'use client'

import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  KeyRound, Loader2, MoreHorizontal, Plus, ShieldAlert, ShieldCheck, Trash2, Users,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

const SYSTEM_ROLES = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR', 'PARENT', 'STUDENT'] as const

interface UserRow {
  id: string
  email: string
  fullName: string
  role: string
  phone: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  branchId: string | null
  lastLoginAt: string | null
  createdAt: string
}

interface UsersResponse {
  items: UserRow[]
  total: number
  page: number
  pageSize: number
  pages: number
}

const createUserSchema = z.object({
  fullName: z.string().min(2, 'Enter the full name').max(120),
  email: z.string().email('Enter a valid email address'),
  role: z.enum(SYSTEM_ROLES),
  phone: z.string().max(30, 'Phone number is too long').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type CreateUserValues = z.infer<typeof createUserSchema>

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive" role="alert">{message}</p>
}

function StatusBadge({ status }: { status: UserRow['status'] }) {
  return status === 'ACTIVE' ? (
    <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> Active
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> Suspended
    </Badge>
  )
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', role: 'TEACHER', phone: '', password: '' },
  })

  const create = useMutation({
    mutationFn: (values: CreateUserValues) => api<{ id: string }>('/users', {
      method: 'POST',
      body: { ...values, phone: values.phone || undefined },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
      onOpenChange(false)
      form.reset()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not create user'),
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={o => { if (!create.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create an account for a staff member, teacher or portal user.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(values => create.mutate(values))} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Full name</Label>
            <Input id="cu-name" placeholder="Chinedu Okafor" {...form.register('fullName')} />
            <FieldError message={errors.fullName?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input id="cu-email" type="email" placeholder="chinedu@school.ng" {...form.register('email')} />
              <FieldError message={errors.email?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="cu-phone" type="tel" placeholder="0803 000 0000" {...form.register('phone')} />
              <FieldError message={errors.phone?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cu-role">Role</Label>
              <Controller
                name="role"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cu-role" className="w-full">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_ROLES.map(r => (
                        <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.role?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-password">Password</Label>
              <Input id="cu-password" type="password" placeholder="Min. 8 characters" {...form.register('password')} />
              <FieldError message={errors.password?.message} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Roles control access — ADMIN gets everything, while PARENT and STUDENT accounts only see the portal.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const qc = useQueryClient()
  const reset = useMutation({
    mutationFn: () => api(`/users/${user?.id ?? ''}`, { method: 'PATCH', body: { password } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(`Password updated for ${user?.fullName ?? 'user'}`)
      setPassword('')
      onClose()
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Password reset failed'),
  })

  return (
    <Dialog open={user !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user?.fullName}. Share it with them over a secure channel.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (password.length < 8) {
              toast.error('Password must be at least 8 characters')
              return
            }
            reset.mutate()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={reset.isPending}>Cancel</Button>
            <Button type="submit" disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersView() {
  const meId = useSession(s => s.user?.id)
  const canWrite = useSession(s => s.can('users.write'))
  const qc = useQueryClient()

  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)

  const filters = { role: roleFilter, status: statusFilter }
  const { data, isLoading } = useQuery({
    queryKey: qk.users(filters),
    queryFn: () => api<UsersResponse>('/users', {
      query: {
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      },
    }),
  })

  const toggleStatus = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}`, {
      method: 'PATCH',
      body: { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
    }),
    onSuccess: (_result, u) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(u.status === 'ACTIVE' ? `${u.fullName} suspended` : `${u.fullName} activated`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Update failed'),
  })

  const removeUser = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}`, { method: 'DELETE' }),
    onSuccess: (_result, u) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(`${u.fullName} deleted`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(() => [
    {
      accessorKey: 'fullName',
      header: 'Name',
      meta: { label: 'Name' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {initials(row.original.fullName)}
          </span>
          <span className="font-medium">{row.original.fullName}</span>
        </div>
      ),
    },
    { accessorKey: 'email', header: 'Email', meta: { label: 'Email' } },
    {
      accessorKey: 'role',
      header: 'Role',
      meta: { label: 'Role' },
      cell: ({ getValue }) => <Badge variant="outline">{titleCase(String(getValue()))}</Badge>,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      meta: { label: 'Phone' },
      cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string | null) || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { label: 'Status' },
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last login',
      meta: { label: 'Last login' },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.lastLoginAt
            ? formatDistanceToNow(new Date(row.original.lastLoginAt), { addSuffix: true })
            : 'Never'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: { label: 'Actions' },
      cell: ({ row }) => {
        const u = row.original
        if (!canWrite) return null
        const isSelf = u.id === meId
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${u.fullName}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setResetTarget(u)}>
                <KeyRound aria-hidden /> Reset password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleStatus.mutate(u)}>
                {u.status === 'ACTIVE' ? <ShieldAlert aria-hidden /> : <ShieldCheck aria-hidden />}
                {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isSelf ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex w-full cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground opacity-50">
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>You cannot delete your own account</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(u)}>
                  <Trash2 aria-hidden /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canWrite, meId, toggleStatus])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Users"
        description="Manage staff, teacher and portal accounts"
        actions={canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> Add user
          </Button>
        ) : undefined}
      />

      <DataTable<UserRow>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        rowId={u => u.id}
        searchPlaceholder="Search name or email…"
        searchExtractor={u => `${u.fullName} ${u.email}`}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger size="sm" className="w-36" aria-label="Filter by role">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All roles</SelectItem>
                {SYSTEM_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        emptyState={
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Add your first team member to get started."
            action={canWrite ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden /> Add user
              </Button>
            ) : undefined}
          />
        }
      />

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title="Delete user?"
        description={`${deleteTarget?.fullName ?? 'This user'} (${deleteTarget?.email ?? ''}) will permanently lose access. This cannot be undone.`}
        confirmLabel="Delete user"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await removeUser.mutateAsync(deleteTarget)
        }}
      />
    </motion.div>
  )
}
