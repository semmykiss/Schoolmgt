'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CalendarRange, ClipboardCheck, Loader2, TrendingUp } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api, qk } from '@/lib/client/api'
import { todayStr } from '@/lib/domain/attendance'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { StatCard } from '@/components/shared/stat-card'
import { cn } from '@/lib/utils'

interface SummaryRow {
  studentId: string; admissionNumber: string; fullName: string
  PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number
  total: number; rate: number
}
interface DayPoint { date: string; PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; total: number; rate: number }
interface SummaryPayload {
  from: string; to: string
  totals: { records: number; rate: number; present: number; absent: number; late: number; excused: number }
  students: SummaryRow[]
  perDay: DayPoint[]
}
interface ClassRow { id: string; name: string; level: number; sections: { id: string; name: string }[] }
interface SessionRow { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[] }

function monthBounds(year: number, month1to12: number): { from: string; to: string } {
  const from = `${year}-${String(month1to12).padStart(2, '0')}-01`
  const lastDay = new Date(year, month1to12, 0).getDate()
  const to = `${year}-${String(month1to12).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function rateTone(rate: number): string {
  if (rate >= 90) return 'text-emerald-700 dark:text-emerald-400'
  if (rate >= 75) return 'text-amber-700 dark:text-amber-400'
  return 'text-destructive'
}

export function SummaryTab() {
  const now = new Date()
  const [classId, setClassId] = useState('NONE')
  const [sectionId, setSectionId] = useState('ALL')
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  const bounds = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const now = new Date()
    return monthBounds(y && m ? y : now.getFullYear(), y && m ? m : now.getMonth() + 1)
  }, [month])

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])
  const selectedClass = classes.find(c => c.id === classId)

  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: SessionRow[] }>('/academics/sessions'),
  })
  const currentTerm = (sessionsData?.items ?? []).flatMap(s => s.terms).find(t => t.isCurrent)

  const { data, isLoading } = useQuery({
    queryKey: qk.attendanceSummary(classId, sectionId === 'ALL' ? undefined : sectionId, bounds.from, bounds.to),
    queryFn: () => api<SummaryPayload>('/attendance/summary', {
      query: {
        classId,
        from: bounds.from, to: bounds.to,
        sectionId: sectionId === 'ALL' ? undefined : sectionId,
      },
    }),
    enabled: classId !== 'NONE',
  })

  const columns = useMemo<ColumnDef<SummaryRow, unknown>[]>(() => [
    {
      accessorKey: 'fullName',
      header: 'Student',
      meta: { label: 'Student' },
      cell: ({ row }) => (
        <div>
          <p className="font-medium leading-tight">{row.original.fullName}</p>
          <p className="text-xs text-muted-foreground">{row.original.admissionNumber}</p>
        </div>
      ),
    },
    { accessorKey: 'PRESENT', header: 'Present', meta: { label: 'Present' }, cell: ({ getValue }) => Number(getValue()) },
    { accessorKey: 'ABSENT', header: 'Absent', meta: { label: 'Absent' }, cell: ({ getValue }) => Number(getValue()) },
    { accessorKey: 'LATE', header: 'Late', meta: { label: 'Late' }, cell: ({ getValue }) => Number(getValue()) },
    { accessorKey: 'EXCUSED', header: 'Excused', meta: { label: 'Excused' }, cell: ({ getValue }) => Number(getValue()) },
    { accessorKey: 'total', header: 'Marked', meta: { label: 'Marked' }, cell: ({ getValue }) => Number(getValue()) },
    {
      accessorKey: 'rate',
      header: 'Rate',
      meta: { label: 'Rate' },
      cell: ({ getValue }) => {
        const r = Number(getValue())
        return (
          <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', rateTone(r))}>
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />{r}%
          </span>
        )
      },
    },
  ], [])

  const chartData = (data?.perDay ?? []).map(d => ({
    ...d,
    day: Number(d.date.slice(8, 10)).toString(),
  }))

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      {/* pickers */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-48">
          <Label>Class</Label>
          <Select value={classId} onValueChange={v => { setClassId(v); setSectionId('ALL') }}>
            <SelectTrigger className="w-full" aria-label="Select class"><SelectValue placeholder="Pick a class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" disabled>Pick a class</SelectItem>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedClass && selectedClass.sections.length > 0 && (
          <div className="w-full space-y-1.5 sm:w-36">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="w-full" aria-label="Select section"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Whole class</SelectItem>
                {selectedClass.sections.map(s => (
                  <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="w-full space-y-1.5 sm:w-40">
          <Label>Month</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Summary month" />
        </div>
        {currentTerm && (
          <p className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground sm:ml-auto sm:pb-2.5">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            {TERM_LABEL[currentTerm.name]}: {currentTerm.startDate} → {currentTerm.endDate}
          </p>
        )}
      </div>

      {classId === 'NONE' ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Pick a class"
          description="Choose a class and month to see attendance analytics."
        />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Attendance rate" value={`${data.totals.rate}%`} icon={TrendingUp} tone="primary"
              hint={`${data.totals.records} register entries`} />
            <StatCard label="Present" value={data.totals.present} icon={ClipboardCheck} tone="success" />
            <StatCard label="Absent" value={data.totals.absent} icon={ClipboardCheck} tone="destructive" />
            <StatCard label="Late + Excused" value={data.totals.late + data.totals.excused} icon={ClipboardCheck} tone="warning"
              hint={`${data.totals.late} late · ${data.totals.excused} excused`} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily attendance — {month}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.some(d => d.total > 0) ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip
                        labelFormatter={label => `${month}-${String(label).padStart(2, '0')}`}
                        cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="PRESENT" name="Present" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="LATE" name="Late" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="EXCUSED" name="Excused" stackId="a" fill="#38bdf8" />
                      <Bar dataKey="ABSENT" name="Absent" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No registers saved in {month} for this class yet.
                </p>
              )}
            </CardContent>
          </Card>

          <DataTable<SummaryRow>
            columns={columns}
            data={data.students}
            loading={false}
            rowId={r => r.studentId}
            searchPlaceholder="Search students…"
            searchExtractor={r => `${r.fullName} ${r.admissionNumber}`}
            initialPageSize={25}
            enableColumnToggle={false}
            emptyState={
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing to summarise"
                description={`No daily registers were taken for this class between ${bounds.from} and ${bounds.to}.`}
              />
            }
          />
          <p className="text-sm text-muted-foreground">Rate counts late arrivals as present (they attended school). Rates under 75% are flagged red.</p>
        </div>
      ) : null}
    </motion.div>
  )
}
