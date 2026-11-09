'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Coffee, Loader2, UserSquare2 } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { DAY_LABELS } from '@/lib/validation/timetable'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'

interface SlotW {
  id: string; day: number; periodId: string; periodName: string | null; periodOrder: number
  className: string | null; sectionName: string | null
  subjectName: string | null; subjectCode: string | null
  periodIsBreak: boolean
}
interface EmployeePick { id: string; fullName: string; staffCode: string; position: string }
interface SessionRow { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; isCurrent: boolean }[] }

export function TeacherGridTab() {
  const [teacherId, setTeacherId] = useState('NONE')
  const [termId, setTermId] = useState('CURRENT')

  const { data: staffData } = useQuery({
    queryKey: qk.employees(),
    queryFn: () => api<{ items: EmployeePick[] }>('/employees'),
  })
  const staff = staffData?.items ?? []

  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: SessionRow[] }>('/academics/sessions'),
  })
  const terms = useMemo(() => (sessionsData?.items ?? []).flatMap(s => s.terms), [sessionsData])
  const effectiveTermId = termId === 'CURRENT' ? (terms.find(t => t.isCurrent)?.id ?? null) : termId
  const activeTerm = terms.find(t => t.id === effectiveTermId)

  const { data, isLoading } = useQuery({
    queryKey: qk.teacherTimetable(effectiveTermId ?? undefined, teacherId),
    queryFn: () => api<{ termId: string | null; items: SlotW[] }>('/timetable/slots', {
      query: { teacherId, termId: effectiveTermId ?? undefined },
    }),
    enabled: teacherId !== 'NONE',
  })

  const slots = data?.items ?? []
  const teaching = slots.filter(s => !s.periodIsBreak)

  // period axis derived from the teacher's own slots (sorted by period order)
  const periodRows = useMemo(() => {
    const rows: { periodId: string; name: string; order: number }[] = []
    const seen = new Set<string>()
    for (const s of slots) {
      if (!seen.has(s.periodId)) {
        seen.add(s.periodId)
        rows.push({ periodId: s.periodId, name: s.periodName ?? 'Period', order: s.periodOrder })
      }
    }
    return rows.sort((a, b) => a.order - b.order)
  }, [slots])

  const grid = useMemo(() => {
    const m = new Map<string, SlotW>()
    for (const s of teaching) m.set(`${s.day}:${s.periodId}`, s)
    return m
  }, [teaching])

  const perDay = useMemo(() => {
    const acc: Record<number, number> = {}
    for (const s of teaching) acc[s.day] = (acc[s.day] ?? 0) + 1
    return acc
  }, [teaching])

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label>Staff member</Label>
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger className="w-full" aria-label="Select staff member"><SelectValue placeholder="Pick a staff member" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" disabled>Pick a staff member</SelectItem>
              {staff.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.fullName} — {t.position}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-56">
          <Label>Term</Label>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="w-full" aria-label="Select term"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CURRENT">Current term</SelectItem>
              {terms.map(t => {
                const sess = (sessionsData?.items ?? []).find(s => s.terms.some(x => x.id === t.id))
                return (
                  <SelectItem key={t.id} value={t.id}>
                    {sess?.name} {TERM_LABEL[t.name] ?? t.name}{t.isCurrent ? ' · now' : ''}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5">
          {DAY_LABELS.slice(0, 5).map((d, di) => (
            <Badge key={d} variant="outline" className="hidden md:inline-flex">
              {d.slice(0, 3)} {perDay[di] ?? 0}
            </Badge>
          ))}
          <Badge variant="secondary">{teaching.length} lesson{teaching.length === 1 ? '' : 's'} / week</Badge>
        </div>
      </div>

      {activeTerm && !activeTerm.isCurrent && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Viewing a non-current term.
        </p>
      )}

      {teacherId === 'NONE' ? (
        <EmptyState
          icon={UserSquare2}
          title="Pick a staff member"
          description="See any teacher's weekly schedule and spot free periods."
        />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card [scrollbar-width:thin]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="sticky left-0 z-10 w-32 bg-muted/80 px-3 py-2.5 text-left font-medium backdrop-blur">Period</th>
                {DAY_LABELS.slice(0, 5).map(d => (
                  <th key={d} className="px-3 py-2.5 text-left font-medium">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodRows.map(pr => (
                <tr key={pr.periodId} className="border-b last:border-0">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium backdrop-blur">{pr.name}</th>
                  {DAY_LABELS.slice(0, 5).map((d, di) => {
                    const slot = grid.get(`${di}:${pr.periodId}`)
                    return (
                      <td key={d} className="px-1.5 py-1.5">
                        {slot ? (
                          <div className="flex h-14 flex-col justify-center gap-0.5 rounded-md border border-primary/20 bg-primary/5 px-2">
                            <span className="line-clamp-1 text-xs font-semibold">{slot.className}{slot.sectionName ? ` ${slot.sectionName}` : ''}</span>
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">{slot.subjectName ?? '—'}</span>
                          </div>
                        ) : (
                          <div className="flex h-14 items-center justify-center rounded-md border border-dashed border-muted-foreground/20 text-[11px] text-muted-foreground/60">
                            Free
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {periodRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    <span className="flex items-center justify-center gap-2">
                      <Coffee className="h-4 w-4" aria-hidden /> No scheduled lessons for this staff member this term.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Timetables are clash-checked automatically — a teacher can never be booked in two classes at once.</p>
    </motion.div>
  )
}
