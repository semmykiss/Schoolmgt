'use client'

import { useQuery } from '@tanstack/react-query'
import { Download, GraduationCap, LayoutList, UserPlus, Users } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { downloadCsv } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/shared/stat-card'
import { ChartCard, CHART, PIE_COLORS, tooltipStyle, axisTick, STATUS_TONE, titleCase } from './chart-kit'
import type { EnrollmentReport } from '@/lib/api/report-data'

export function EnrollmentTab({ canWrite }: { canWrite: boolean }) {
  const { data: e, isLoading } = useQuery({
    queryKey: qk.reportEnrollment,
    queryFn: () => api<EnrollmentReport>('/reports/enrollment'),
  })

  const classData = (e?.byClass ?? []).map(c => ({ ...c, students: c.students }))
  const genderData = e?.genderMix ?? []
  const trendData = (e?.admissionsTrend ?? []).map(t => ({ ...t, students: t.count }))

  const exportCsv = () => {
    if (!e) return
    downloadCsv('enrollment-report', e.byClass as unknown as Record<string, unknown>[], [
      { key: 'className', label: 'Class' },
      { key: 'students', label: 'Active students' },
      { key: 'male', label: 'Male' },
      { key: 'female', label: 'Female' },
      { key: 'sections', label: 'Sections' },
    ])
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={e?.totals.activeStudents ?? 0}
          icon={Users}
          tone="primary"
          loading={isLoading}
          hint={e ? `${e.totals.male} male • ${e.totals.female} female` : undefined}
        />
        <StatCard
          label="Classes / sections"
          value={e ? `${e.totals.classes} / ${e.totals.sections}` : 0}
          icon={GraduationCap}
          loading={isLoading}
        />
        <StatCard label="Active staff" value={e?.totals.staff ?? 0} icon={Users} loading={isLoading} />
        <StatCard
          label="Open applicants"
          value={e?.totals.openApplicants ?? 0}
          icon={UserPlus}
          tone="warning"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Students by class"
          icon={GraduationCap}
          loading={isLoading}
          empty={(classData.length ?? 0) === 0 ? 'No classes yet' : null}
          className="lg:col-span-2"
          action={
            canWrite ? (
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!e}>
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                CSV
              </Button>
            ) : undefined
          }
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="className" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} angle={-32} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="students" name="Active students" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Gender mix" icon={Users} loading={isLoading} empty={(genderData.length ?? 0) === 0 ? 'No students yet' : null}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderData} dataKey="count" nameKey="gender" innerRadius={52} outerRadius={88} paddingAngle={2}>
                  {genderData.map((_, i) => <Cell key={i} fill={[CHART.teal, CHART.amber][i % 2]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
            {genderData.map(g => (
              <span key={g.gender}>{g.gender}: <span className="font-semibold text-foreground">{g.count}</span></span>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Admissions trend — last 12 months"
          icon={UserPlus}
          loading={isLoading}
          empty={trendData.every(t => t.count === 0) ? 'No admissions recorded yet' : null}
          className="lg:col-span-2"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} interval={1} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Line type="monotone" dataKey="students" name="New students" stroke={CHART.teal} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Student & staff composition" icon={LayoutList} loading={isLoading} empty={null}>
          <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Students by status</p>
              <div className="flex flex-wrap gap-1.5">
                {(e?.byStatus ?? []).map(s => (
                  <Badge key={s.status} className={STATUS_TONE[s.status] ?? 'bg-muted text-muted-foreground'} variant="secondary">
                    {titleCase(s.status)}: {s.count}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Staff by department</p>
              <div className="flex flex-wrap gap-1.5">
                {(e?.staffByDepartment ?? []).map(s => (
                  <Badge key={s.department} variant="secondary" className="bg-primary/10 text-primary">
                    {s.department}: {s.count}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Staff by contract type</p>
              <div className="flex flex-wrap gap-1.5">
                {(e?.staffByType ?? []).map(s => (
                  <Badge key={s.type} className={STATUS_TONE[s.type.replace(' ', '_')] ?? 'bg-muted text-muted-foreground'} variant="secondary">
                    {titleCase(s.type)}: {s.count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
