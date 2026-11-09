'use client'

import { useQuery } from '@tanstack/react-query'
import { Download, GraduationCap, ListChecks, Trophy, UserX } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, qk } from '@/lib/client/api'
import { downloadCsv } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatCard } from '@/components/shared/stat-card'
import { ChartCard, CHART, tooltipStyle, axisTick } from './chart-kit'
import type { AcademicReport, ReportFilters } from './types'

interface Props {
  filters: ReportFilters
  onFilterChange: (patch: Partial<ReportFilters>) => void
  canWrite: boolean
}

export function AcademicTab({ filters, onFilterChange, canWrite }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: qk.reportAcademic(filters.examId),
    queryFn: () => api<AcademicReport>(`/reports/academic${filters.examId ? `?examId=${filters.examId}` : ''}`),
  })

  const exam = data?.exam
  const classData = (data?.classAverages ?? []).map(c => ({ name: c.className, average: c.average }))
  const subjectData = (data?.subjectAverages ?? []).slice(0, 12).map(s => ({ name: s.subject, average: s.average }))
  const gradeData = data?.gradeDistribution ?? []

  const exportCsv = () => {
    if (!data) return
    downloadCsv('academic-report', data.topStudents as unknown as Record<string, unknown>[], [
      { key: 'rank', label: 'Rank' },
      { key: 'name', label: 'Student' },
      { key: 'className', label: 'Class' },
      { key: 'average', label: 'Average %' },
      { key: 'subjects', label: 'Subjects' },
    ])
  }

  return (
    <div className="space-y-4">
      <ChartCard
        title="Exam performance"
        icon={GraduationCap}
        loading={isLoading}
        empty={!exam ? 'No exams recorded yet — create an exam and enter marks first' : null}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={filters.examId || 'latest'}
              onValueChange={v => onFilterChange({ examId: v === 'latest' ? '' : v })}
            >
              <SelectTrigger className="h-9 w-[220px] text-xs" aria-label="Select exam">
                <SelectValue placeholder="Select exam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest exam{data?.exam ? ` (${data.exam.name})` : ''}</SelectItem>
                {(data?.exams ?? []).map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!data || data.topStudents.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                CSV
              </Button>
            )}
          </div>
        }
        contentClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Entries" value={data?.summary.entries ?? 0} icon={ListChecks} tone="primary" />
          <StatCard label="Students" value={data?.summary.students ?? 0} icon={GraduationCap} />
          <StatCard
            label="School average"
            value={data?.summary.average !== null && data?.summary.average !== undefined ? `${data.summary.average}%` : '—'}
            icon={Trophy}
            tone="success"
          />
          <StatCard label="Absent papers" value={data?.summary.absent ?? 0} icon={UserX} tone="warning" />
        </div>
        {exam && (
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{exam.name}</span> — {exam.term} term, {exam.session}
            {exam.published ? ' • results published' : ' • results not yet published'}
          </p>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Average score by class"
          icon={GraduationCap}
          loading={isLoading}
          empty={(classData.length ?? 0) === 0 ? 'No marks entered yet' : null}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} angle={-32} textAnchor="end" height={56} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={36} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => `${v}%`} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="average" name="Average %" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Average score by subject"
          icon={ListChecks}
          loading={isLoading}
          empty={(subjectData.length ?? 0) === 0 ? 'No marks entered yet' : null}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} />
                <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ ...axisTick, fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} formatter={v => `${v}%`} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="average" name="Average %" fill={CHART.amber} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Grade distribution"
          icon={ListChecks}
          loading={isLoading}
          empty={(gradeData.length ?? 0) === 0 ? 'No grades computed yet' : null}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="grade" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={axisTick} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={axisTick} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted-foreground)' }} />
                <Bar dataKey="count" name="Papers" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top 10 students"
          icon={Trophy}
          loading={isLoading}
          empty={(data?.topStudents.length ?? 0) === 0 ? 'No marks entered yet' : null}
        >
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.topStudents ?? []).map(s => (
                  <TableRow key={s.studentId}>
                    <TableCell className="font-medium">{s.rank}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.className}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{s.average}%</TableCell>
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
