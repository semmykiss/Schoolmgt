'use client'

import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  BookOpen, BriefcaseBusiness, CalendarClock, ClipboardCheck, Download, LogIn, Megaphone,
  Pencil, Plus, RefreshCw, Trash2, UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira } from '@/lib/money'
import { navigate } from '@/hooks/use-hash-route'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'

interface DashboardData {
  term: { id: string; name: string; session: string } | null
  counts: { students: number; staff: number; classes: number }
  attendanceToday: { present: number; absent: number; late: number; excused: number; total: number; rate: number | null }
  fees: { collectedThisMonth: number; outstanding: number }
  upcomingExams: { id: string; examName: string; subject: string; className: string; date: string; startTime: string; endTime: string }[]
  recentAdmissions: { id: string; admissionNumber: string; fullName: string; className: string | null; admissionDate: string; status: string }[]
  recentActivity: { id: string; userName: string | null; action: string; entity: string; summary: string | null; createdAt: string }[]
  cashflow: { month: string; income: number; expense: number }[]
}

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  LOGIN: LogIn,
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  EXPORT: Download,
  PUBLISH: Megaphone,
}

const ACTIVITY_TONE: Record<string, string> = {
  LOGIN: 'bg-muted text-muted-foreground',
  CREATE: 'bg-primary/10 text-primary',
  UPDATE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  DELETE: 'bg-destructive/10 text-destructive',
  EXPORT: 'bg-muted text-muted-foreground',
  PUBLISH: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

export function DashboardView() {
  const user = useSession(s => s.user)
  const school = useSession(s => s.school)
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api<DashboardData>('/dashboard'),
  })

  const hour = new Date().getHours()
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const firstName = (user?.fullName ?? 'there').trim().split(/\s+/)[0]

  const term = data?.term ?? null
  const attendance = data?.attendanceToday
  const cashflow = data?.cashflow ?? []
  const chartData = cashflow.map(c => ({
    month: format(new Date(`${c.month}-01T00:00:00`), 'MMM'),
    income: c.income,
    expense: c.expense,
  }))
  const feesMonth = format(new Date(), 'MMMM')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title={`Good ${partOfDay}, ${firstName}`}
        description={school ? [school.name, school.city].filter(Boolean).join(' • ') : undefined}
        actions={
          <>
            {term && (
              <Badge variant="secondary" className="h-9 px-3 text-xs">
                {titleCase(term.name)} Term • {term.session}
              </Badge>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh dashboard" disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Students" value={data?.counts.students ?? 0} icon={Users} tone="primary" loading={isLoading} />
        <StatCard label="Staff" value={data?.counts.staff ?? 0} icon={BriefcaseBusiness} loading={isLoading} />
        <StatCard label="Classes" value={data?.counts.classes ?? 0} icon={BookOpen} loading={isLoading} />
        <StatCard
          label="Attendance Today"
          value={`${attendance?.rate ?? '—'}%`}
          icon={ClipboardCheck}
          tone="success"
          loading={isLoading}
          hint={
            attendance && attendance.total > 0
              ? `${attendance.present} present • ${attendance.absent} absent • ${attendance.late} late`
              : 'Not marked yet'
          }
        />
      </div>

      {/* Chart + fees */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
              </span>
              Income vs Expense — last 6 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState icon={Wallet} title="No financial data yet" description="Income and expense appear here once fees are recorded." className="border-0 py-8" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    />
                    <YAxis
                      tickFormatter={v => formatNaira(Number(v), { compact: true })}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
                      formatter={v => formatNaira(Number(v))}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        color: 'var(--popover-foreground)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income" name="Income" fill="#0F766E" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="expense" name="Expense" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
              </span>
              Fees — {feesMonth}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <>
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-36" />
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected this month</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">
                    {formatNaira(data?.fees.collectedThisMonth ?? 0)}
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm text-muted-foreground">Outstanding (term)</span>
                  <span className={cn(
                    'text-sm font-semibold tabular-nums',
                    (data?.fees.outstanding ?? 0) > 0 && 'text-amber-600 dark:text-amber-400',
                  )}>
                    {formatNaira(data?.fees.outstanding ?? 0)}
                  </span>
                </div>
                <Button variant="link" className="h-9 px-0" disabled title="Phase 4">
                  Go to Fees &amp; Billing →
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exams / admissions / activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              </span>
              Upcoming Exams
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            {isLoading ? (
              <div className="space-y-2 px-1">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (data?.upcomingExams.length ?? 0) === 0 ? (
              <EmptyState icon={CalendarClock} title="No exams scheduled" className="border-0 py-8" />
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {data!.upcomingExams.map(e => (
                  <li key={e.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.className} • {e.examName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{format(new Date(`${e.date}T00:00:00`), 'd MMM')}</p>
                      <p className="text-xs text-muted-foreground">{e.startTime}–{e.endTime}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
              </span>
              Recent Admissions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            {isLoading ? (
              <div className="space-y-2 px-1">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (data?.recentAdmissions.length ?? 0) === 0 ? (
              <EmptyState icon={UserPlus} title="No recent admissions" className="border-0 py-8" />
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {data!.recentAdmissions.map(a => (
                  <li key={a.id} className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(a.fullName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.admissionNumber}{a.className ? ` • ${a.className}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(a.admissionDate), 'd MMM yy')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              </span>
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            {isLoading ? (
              <div className="space-y-2 px-1">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (data?.recentActivity.length ?? 0) === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No activity yet" className="border-0 py-8" />
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {data!.recentActivity.map(item => {
                  const Icon = ACTIVITY_ICON[item.action] ?? ClipboardCheck
                  return (
                    <li key={item.id} className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/50">
                      <span className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        ACTIVITY_TONE[item.action] ?? 'bg-muted text-muted-foreground',
                      )}>
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.userName ?? 'System'}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.summary ?? item.entity}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
