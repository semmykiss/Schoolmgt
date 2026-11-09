'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarRange, ClipboardCheck, Download, UserX, Users } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { downloadCsv } from '@/lib/csv'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatCard } from '@/components/shared/stat-card'
import { ChartCard, CHART, PIE_COLORS, tooltipStyle, axisTick, titleCase } from './chart-kit'
import type { AttendanceReport, ReportFilters } from './types'

interface Props {
  filters: ReportFilters
  onFilterChange: (patch: Partial<ReportFilters>) => void
  canWrite: boolean
}

export function AttendanceTab({ filters, onFilterChange, canWrite }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: qk.reportAttendance(filters.from, filters.to, filters.classId),
    queryFn: () => {
      const qs = new URLSearchParams({ from: filters.from, to: filters.to })
      if (filters.classId) qs.set('classId', filters.classId)
      return api<AttendanceReport>(`/reports/attendance?${qs.toString()}`)
    },
  })

  const trendData = data?.dailyTrend ?? []
  const classData = (data?.byClass ?? []).filter(c => c.total > 0).map(c => ({ name: c.className, rate: c.rate ?? 0 }))
  const mixData = (data?.statusMix ?? []).map(s => ({ name: titleCase(s.status.toLowerCase()), value: s.count }))

  const exportCsv = () => {
    if (!data) return
    downloadCsv('attendance-report', data.byClass.map(r => ({
      className: r.className,
      students: r.students,
      marked: r.total,
      presentLate: r.present,
      rate: r.rate ?? '',
    })), [
      { key: 'className', label: 'Class' },
      { key: 'students', label: 'Students' },
      { key: 'marked', label: 'Marks recorded' },
      { key: 'presentLate', label: 'Present+Late' },
      { key: 'rate', label: 'Attendance %' },
    ])
  }

  return (
    <div className="space-y-4">
      <ChartCard
        title="Student attendance"
        icon={ClipboardCheck}
        loading={isLoading}
        empty={null}
        action={
          canWrite ? (
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!data || data.byClass.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              CSV
            </Button>
          ) : undefined
        }
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="att-from" className="text-xs text-muted-foreground">From</Label>
            <Input
              id="att-from" type="date" value={filters.from}
              onChange={e => onFilterChange({ from: e.target.value })}
              className="h-9 w-[150px]" aria-label="Attendance from date"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="att-to" className="text-xs text-muted-foreground">To</Label>
            <Input
              id="att-to" type="date" value={filters.to}
              onChange={e => onFilterChange({ to: e.target.value })}
              className="h-9 w-[150px]" aria-label="Attendance to date"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Class</Label>
            <Select value={filters.classId || 'all'} onValueChange={v => onFilterChange({ classId: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9 w-[180px] text-xs" aria-label="Select class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(data?.classes ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data && (
            <p className="ml-auto pb-1 text-xs text-muted-foreground">
              {format(new Date(`${data.range.from}T00:00:00`), 'd MMM')} – {format(new Date(`${data.range.to}T00:00:00`), 'd MMM yyyy')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Attendance rate"
            value={data?.summary.rate !== null && data?.summary.rate !== undefined ? `${data.summary.rate}%` : '—'}
            icon={ClipboardCheck}
            tone="success"
          />
          <StatCard label="Present + late" value={(data?.summary.present ?? 0) + (data?.summary.late ?? 0)} icon={Users} tone="primary" hint={`${data?.summary.excused ?? 0} excused`} />
          <StatCard label="Absences" value={data?.summary.absent ?? 0} icon={UserX} tone="destructive" hint={`${data?.summary.records ?? 0} marks recorded`} />
          <StatCard
            label="Staff attendance"
            value={data?.staff.rate !== null && data?.staff.rate !== undefined ? `${data.staff.rate}%` : '—'}
            icon={CalendarRange}
            hint={data?.staff.records ? `${data.staff.present} present • ${data.staff.absent} absent • ${data.staff.onLeave} on leave` : 'No staff marks in range'}
          />
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Daily attendance rate"
          icon={CalendarRange}
          loading={isLoading}
          empty={trendData.every(t => t.total === 0) ? 'No attendance marked in this range' : null}
          className="lg:col-span-2"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} interval={Math.max(1, Math.floor(trendData.length / 10))} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} width={44} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Line type="monotone" dataKey="rate" name="Attendance %" stroke={CHART.teal} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Status mix" icon={ClipboardCheck} loading={isLoading} empty={(mixData.length ?? 0) === 0 ? 'No records yet' : null}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>
                  {mixData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {mixData.map(m => (
              <span key={m.name}>{m.name}: <span className="font-semibold text-foreground">{m.value}</span></span>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Attendance rate by class"
          icon={Users}
          loading={isLoading}
          empty={(classData.length ?? 0) === 0 ? 'No attendance marked yet' : null}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} angle={-32} textAnchor="end" height={56} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} width={44} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => `${v}%`} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="rate" name="Attendance %" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Students with most absences"
          icon={UserX}
          loading={isLoading}
          empty={(data?.chronicAbsentees.length ?? 0) === 0 ? 'No absences recorded 🎉' : null}
        >
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Absences</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.chronicAbsentees ?? []).map(s => (
                  <TableRow key={s.studentId}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.className}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.absences}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{s.rate !== null ? `${s.rate}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
