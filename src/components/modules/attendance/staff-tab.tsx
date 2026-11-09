'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { CheckCheck, Loader2, Save, UserCheck } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { STAFF_STATUSES, STATUS_LABELS, STATUS_STYLES, todayStr, type StaffStatus } from '@/lib/domain/attendance'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'

interface EmployeeRow { id: string; staffCode: string; position: string; fullName: string }
interface Mark { status: string; checkIn: string | null; checkOut: string | null; remarks: string | null }
interface StaffPayload { date: string; employees: EmployeeRow[]; marks: Record<string, Mark> }

type Draft = Record<string, { status: StaffStatus; checkIn: string; checkOut: string; remarks: string }>

export function StaffTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayStr())
  const [draft, setDraft] = useState<Draft>({})
  const [dirty, setDirty] = useState(false)

  const registerKey = qk.staffAttendance(date)
  const { data: register, isLoading, isFetching } = useQuery({
    queryKey: registerKey,
    queryFn: () => api<StaffPayload>('/attendance/staff', { query: { date } }),
  })

  const [seededKey, setSeededKey] = useState('')
  const seedKey = registerKey.join('|')
  if (register && seededKey !== seedKey) {
    setSeededKey(seedKey)
    const next: Draft = {}
    for (const e of register.employees) {
      const saved = register.marks[e.id]
      next[e.id] = {
        status: (saved?.status as StaffStatus) ?? 'PRESENT',
        checkIn: saved?.checkIn ?? '',
        checkOut: saved?.checkOut ?? '',
        remarks: saved?.remarks ?? '',
      }
    }
    setDraft(next)
    setDirty(false)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const id of Object.keys(draft)) {
      const st = draft[id]?.status
      if (st) c[st] = (c[st] ?? 0) + 1
    }
    return c
  }, [draft])

  const save = useMutation({
    mutationFn: () => {
      const records = Object.entries(draft).map(([employeeId, v]) => ({
        employeeId, status: v.status,
        checkIn: v.checkIn || undefined, checkOut: v.checkOut || undefined,
        remarks: v.remarks || undefined,
      }))
      return api('/attendance/staff', { method: 'POST', body: { date, records } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setDirty(false)
      toast.success('Staff register saved')
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const setAll = (status: StaffStatus) => {
    const next: Draft = {}
    for (const id of Object.keys(draft)) next[id] = { ...draft[id], status }
    setDraft(next)
    setDirty(true)
  }

  const patch = (id: string, part: Partial<Draft[string]>) => {
    setDraft(d => ({ ...d, [id]: { ...d[id], ...part } }))
    setDirty(true)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="staff-date">Date</Label>
          <Input id="staff-date" type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
        </div>
        {register && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
            {STAFF_STATUSES.map(st => (
              <Badge key={st} className={cn('font-medium', STATUS_STYLES[st])}>
                {STATUS_LABELS[st]} {counts[st] ?? 0}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : !register || register.employees.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No staff yet"
          description="Staff appear here once employees are added in the HR module."
        />
      ) : (
        <div className="space-y-3">
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

          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y" role="list" aria-label="Staff attendance register">
              {register.employees.map((e, i) => {
                const d = draft[e.id] ?? { status: 'PRESENT' as StaffStatus, checkIn: '', checkOut: '', remarks: '' }
                return (
                  <li key={e.id} className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:gap-3">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.fullName}</p>
                      <p className="text-xs text-muted-foreground">{e.position} · {e.staffCode}</p>
                    </div>
                    {canWrite ? (
                      <>
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Attendance for ${e.fullName}`}>
                          {STAFF_STATUSES.map(st => (
                            <button
                              key={st}
                              type="button"
                              role="radio"
                              aria-checked={d.status === st}
                              onClick={() => patch(e.id, { status: st })}
                              className={cn(
                                'min-h-9 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                                d.status === st
                                  ? STATUS_STYLES[st]
                                  : 'text-muted-foreground hover:bg-muted',
                              )}
                            >
                              {st === 'PRESENT' ? 'P' : st === 'ABSENT' ? 'A' : st === 'LATE' ? 'L' : st === 'EXCUSED' ? 'E' : 'LV'}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="time" value={d.checkIn}
                            onChange={ev => patch(e.id, { checkIn: ev.target.value })}
                            className="h-9 w-[104px] text-xs"
                            aria-label={`Check-in for ${e.fullName}`}
                          />
                          <span className="text-xs text-muted-foreground">→</span>
                          <Input
                            type="time" value={d.checkOut}
                            onChange={ev => patch(e.id, { checkOut: ev.target.value })}
                            className="h-9 w-[104px] text-xs"
                            aria-label={`Check-out for ${e.fullName}`}
                          />
                        </div>
                        <Input
                          value={d.remarks}
                          onChange={ev => patch(e.id, { remarks: ev.target.value })}
                          placeholder="Remark (optional)"
                          className="h-9 w-full text-xs lg:w-36"
                          aria-label={`Remark for ${e.fullName}`}
                        />
                      </>
                    ) : (
                      <Badge className={cn('font-medium', STATUS_STYLES[d.status])}>{STATUS_LABELS[d.status]}</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            {isFetching ? 'Refreshing…' : 'Check-in / check-out times are optional — leave them blank for simple registers.'}
          </p>
        </div>
      )}
    </motion.div>
  )
}
