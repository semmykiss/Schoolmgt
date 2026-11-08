'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { CalendarDays, CheckCheck, Loader2, Save } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { ATTENDANCE_STATUSES, STATUS_LABELS, STATUS_STYLES, todayStr, type AttendanceStatus } from '@/lib/domain/attendance'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { ClipboardCheck } from 'lucide-react'

interface StudentRow { id: string; admissionNumber: string; fullName: string; gender: string }
interface RegisterPayload {
  date: string
  periodId: string | null
  weekday: string
  class: { id: string; name: string }
  students: StudentRow[]
  marks: Record<string, { status: string; remarks: string | null }>
}
interface ClassRow { id: string; name: string; level: number; sections: { id: string; name: string }[] }
interface PeriodRow { id: string; name: string; isBreak: boolean; order: number }
interface SessionRow { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[] }

type Draft = Record<string, { status: AttendanceStatus; remarks: string }>

export function MarkTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [classId, setClassId] = useState('NONE')
  const [sectionId, setSectionId] = useState('ALL')
  const [periodId, setPeriodId] = useState('DAILY')
  const [date, setDate] = useState(todayStr())
  const [draft, setDraft] = useState<Draft>({})
  const [dirty, setDirty] = useState(false)

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])
  const selectedClass = classes.find(c => c.id === classId)

  const { data: periodsData } = useQuery({
    queryKey: qk.periods(),
    queryFn: () => api<{ items: PeriodRow[] }>('/timetable/periods'),
  })
  const teachingPeriods = (periodsData?.items ?? []).filter(p => !p.isBreak)

  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: SessionRow[] }>('/academics/sessions'),
  })
  const currentTerm = (sessionsData?.items ?? []).flatMap(s => s.terms).find(t => t.isCurrent)
  const dateInTerm = currentTerm && date >= currentTerm.startDate && date <= currentTerm.endDate

  const registerKey = qk.attendanceRegister(classId, sectionId === 'ALL' ? undefined : sectionId, date, periodId === 'DAILY' ? undefined : periodId)
  const { data: register, isLoading, isFetching } = useQuery({
    queryKey: registerKey,
    queryFn: () => api<RegisterPayload>('/attendance', {
      query: {
        classId,
        date,
        sectionId: sectionId === 'ALL' ? undefined : sectionId,
        periodId: periodId === 'DAILY' ? undefined : periodId,
      },
    }),
    enabled: classId !== 'NONE',
  })

  // seed the draft once the register loads
  const [seededKey, setSeededKey] = useState('')
  const seedKey = registerKey.join('|')
  if (register && seededKey !== seedKey) {
    setSeededKey(seedKey)
    const next: Draft = {}
    for (const s of register.students) {
      const saved = register.marks[s.id]
      next[s.id] = { status: (saved?.status as AttendanceStatus) ?? 'PRESENT', remarks: saved?.remarks ?? '' }
    }
    setDraft(next)
    setDirty(false)
  }

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
    for (const id of Object.keys(draft)) if (draft[id]) c[draft[id].status]++
    return c
  }, [draft])

  const save = useMutation({
    mutationFn: () => {
      if (!register) throw new Error('Register not loaded')
      const records = Object.entries(draft).map(([studentId, v]) => ({
        studentId, status: v.status, remarks: v.remarks || undefined,
      }))
      return api<{ saved: number; notified: number; counts: Record<string, number> }>('/attendance', {
        method: 'POST',
        body: {
          date, classId,
          sectionId: sectionId === 'ALL' ? null : sectionId,
          periodId: periodId === 'DAILY' ? null : periodId,
          records,
        },
      })
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setDirty(false)
      toast.success(`Saved ${r.saved} students` +
        (r.notified ? ` — ${r.notified} parent alert${r.notified === 1 ? '' : 's'} sent` : ''))
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const setAll = (status: AttendanceStatus) => {
    const next: Draft = {}
    for (const id of Object.keys(draft)) next[id] = { ...draft[id], status }
    setDraft(next)
    setDirty(true)
  }

  const markOne = (id: string, status: AttendanceStatus) => {
    if (!draft[id]) return
    setDraft(d => ({ ...d, [id]: { ...d[id], status } }))
    setDirty(true)
  }

  const setRemarks = (id: string, remarks: string) => {
    setDraft(d => ({ ...d, [id]: { ...d[id], remarks } }))
    setDirty(true)
  }

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
          <Label>Date</Label>
          <Input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} aria-label="Attendance date" />
        </div>
        <div className="w-full space-y-1.5 sm:w-44">
          <Label>Register</Label>
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-full" aria-label="Register type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY">Whole day</SelectItem>
              {teachingPeriods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {classId !== 'NONE' && register && !dateInTerm && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Heads up: {date} falls outside the current term ({currentTerm ? `${TERM_LABEL[currentTerm.name]} ends ${currentTerm.endDate}` : ''}).
        </p>
      )}

      {classId === 'NONE' ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Pick a class"
          description="Choose a class and date to open its attendance register."
        />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : register && register.students.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No active students"
          description={`No active students found in ${register.class.name} for this register.`}
        />
      ) : register ? (
        <div className="space-y-3">
          {/* summary strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
              {register.weekday}, {date}
            </span>
            <Badge variant="outline">{register.class.name}{sectionId !== 'ALL' ? ` · Section ${selectedClass?.sections.find(s => s.id === sectionId)?.name ?? ''}` : ''}</Badge>
            <Badge variant="outline">{periodId === 'DAILY' ? 'Whole-day register' : teachingPeriods.find(p => p.id === periodId)?.name}</Badge>
            {register.marks && Object.keys(register.marks).length > 0 && !dirty && (
              <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">Saved</Badge>
            )}
            <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
              {ATTENDANCE_STATUSES.map(st => (
                <Badge key={st} className={cn('font-medium', STATUS_STYLES[st])}>
                  {STATUS_LABELS[st]} {counts[st]}
                </Badge>
              ))}
            </div>
          </div>

          {/* bulk actions */}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setAll('PRESENT')}>
                <CheckCheck aria-hidden /> Mark all present
              </Button>
              <div className="flex-1" />
              <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
                {save.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  : <Save className="h-4 w-4" aria-hidden />}
                {dirty ? 'Save register' : 'Saved'}
              </Button>
            </div>
          )}

          {/* register list */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y" role="list" aria-label="Attendance register">
              {register.students.map((s, i) => {
                const d = draft[s.id] ?? { status: 'PRESENT' as AttendanceStatus, remarks: '' }
                return (
                  <li key={s.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.admissionNumber}</p>
                    </div>
                    {canWrite ? (
                      <>
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Attendance for ${s.fullName}`}>
                          {ATTENDANCE_STATUSES.map(st => (
                            <button
                              key={st}
                              type="button"
                              role="radio"
                              aria-checked={d.status === st}
                              onClick={() => markOne(s.id, st)}
                              className={cn(
                                'min-h-9 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                                d.status === st
                                  ? STATUS_STYLES[st]
                                  : 'text-muted-foreground hover:bg-muted',
                              )}
                            >
                              {st === 'PRESENT' ? 'P' : st === 'ABSENT' ? 'A' : st === 'LATE' ? 'L' : 'E'}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={d.remarks}
                          onChange={e => setRemarks(s.id, e.target.value)}
                          placeholder="Remark (optional)"
                          className="h-9 w-full text-xs sm:w-44"
                          aria-label={`Remark for ${s.fullName}`}
                        />
                      </>
                    ) : (
                      <Badge className={cn('justify-self-start font-medium sm:justify-self-end', STATUS_STYLES[d.status])}>
                        {STATUS_LABELS[d.status]}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            {isFetching ? 'Refreshing…' : 'Whole-day absences notify portal-linked parents automatically when you save.'}
          </p>
        </div>
      ) : null}
    </motion.div>
  )
}
