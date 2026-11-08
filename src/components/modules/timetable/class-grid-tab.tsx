'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AlertTriangle, Coffee, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { findClash } from '@/lib/domain/timetable'
import { DAY_LABELS } from '@/lib/validation/timetable'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/shared/empty-state'
import { FieldError } from '@/components/shared/field-error'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Grid3X3 } from 'lucide-react'

// ── wire shapes (match /timetable/grid) ─────────────────────────────────────
interface PeriodW { id: string; name: string; startTime: string; endTime: string; order: number; isBreak: boolean }
interface SlotW {
  id: string; termId: string; classId: string; className: string | null
  sectionId: string | null; sectionName: string | null
  day: number; periodId: string
  classSubjectId: string | null; subjectId: string | null; subjectName: string | null; subjectCode: string | null
  teacherId: string | null; teacherName: string | null
}
interface ClassSubjectW {
  id: string; subjectId: string; subjectName: string; subjectCode: string | null
  defaultTeacherId: string | null; defaultTeacherName: string | null
}
interface GridPayload {
  term: { id: string; name: string; isCurrent: boolean } | null
  periods: PeriodW[]
  slots: SlotW[]
  allSlots: SlotW[]
  classSubjects: ClassSubjectW[]
  teachers: { id: string; name: string; staffCode: string }[]
}
interface ClassRow { id: string; name: string; level: number; sections: { id: string; name: string }[] }
interface TermRow { id: string; name: string; isCurrent: boolean; session: { id: string; name: string; isCurrent: boolean } }

// ── slot editor dialog ──────────────────────────────────────────────────────
function SlotDialog({ open, onOpenChange, day, period, existing, termId, classId, sectionId, allSlots, classSubjects, teachers, canWrite }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  day: number
  period: PeriodW | null
  existing: SlotW | null                       // slot in this cell (edit) or null (add)
  termId: string | null
  classId: string
  sectionId: string | null
  allSlots: SlotW[]                            // whole term, for client-side clash prechecks
  classSubjects: ClassSubjectW[]
  teachers: { id: string; name: string; staffCode: string }[]
  canWrite: boolean
}) {
  const qc = useQueryClient()
  const [subjectKey, setSubjectKey] = useState('FREE')
  const [teacherId, setTeacherId] = useState('NONE')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const seenKey = `${open}-${period?.id ?? 'x'}-${existing?.id ?? 'new'}`
  const [seen, setSeen] = useState('')
  if (open && seen !== seenKey) {
    setSeen(seenKey)
    setSubjectKey(existing?.classSubjectId ?? 'FREE')
    setTeacherId(existing?.teacherId ?? 'NONE')
  }

  // live clash precheck — same logic the server runs
  const selectedCs = classSubjects.find(c => c.id === subjectKey)
  const proposedTeacher = teacherId !== 'NONE'
    ? teacherId
    : (selectedCs?.defaultTeacherId ?? null)
  const clash = useMemo(() => {
    if (!open || !period || !termId) return null
    if (subjectKey === 'FREE') return null
    return findClash(
      { termId, classId, sectionId, day, periodId: period.id, teacherId: proposedTeacher },
      allSlots,
      existing?.id,
    )
  }, [open, period, day, subjectKey, proposedTeacher, allSlots, existing, termId, classId, sectionId])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        classSubjectId: subjectKey === 'FREE' ? null : subjectKey,
        teacherId: teacherId === 'NONE' ? (selectedCs?.defaultTeacherId ?? null) : (teacherId as string | null),
      }
      if (existing) {
        return api(`/timetable/slots/${existing.id}`, { method: 'PATCH', body: payload })
      }
      return api('/timetable/slots', {
        method: 'POST',
        body: {
          termId, classId,
          sectionId: sectionId ?? null,
          day,
          periodId: period?.id,
          ...payload,
        },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] })
      toast.success(existing ? 'Slot updated' : 'Lesson scheduled')
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const remove = useMutation({
    mutationFn: () => api(`/timetable/slots/${existing?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] })
      toast.success('Slot cleared')
      setConfirmDelete(false)
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!save.isPending && !remove.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Edit lesson' : 'Schedule lesson'} — {DAY_LABELS[day]}{period ? `, ${period.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            {period ? `${period.startTime} – ${period.endTime}` : ''} · pick a subject (teacher defaults from the class assignment).
          </DialogDescription>
        </DialogHeader>

        {clash && canWrite && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Clash detected</AlertTitle>
            <AlertDescription>
              {clash.type === 'CLASS'
                ? 'This class already has a lesson in this period.'
                : `${clash.where} is already teaching at this time — clear it there first or pick another teacher.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subjectKey} onValueChange={v => { setSubjectKey(v); if (v !== 'FREE') setTeacherId('NONE') }} disabled={!canWrite}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FREE">Free period</SelectItem>
                {classSubjects.map(cs => (
                  <SelectItem key={cs.id} value={cs.id}>
                    {cs.subjectName}{cs.subjectCode ? ` (${cs.subjectCode})` : ''}
                    {cs.defaultTeacherName ? ` — ${cs.defaultTeacherName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Teacher</Label>
            <Select
              value={teacherId} onValueChange={setTeacherId}
              disabled={!canWrite || subjectKey === 'FREE'}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">
                  {selectedCs?.defaultTeacherId
                    ? `Default — ${selectedCs.defaultTeacherName ?? ''}`
                    : 'No teacher'}
                </SelectItem>
                {teachers.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.staffCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={clash?.type === 'TEACHER' ? `${clash.where} is double-booked` : undefined} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {existing && canWrite ? (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={save.isPending}>
              <Trash2 aria-hidden /> Clear slot
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            {canWrite && (
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || (clash !== null) || subjectKey === 'FREE' && !existing}
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {existing ? 'Save changes' : 'Schedule'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmDelete}
      onOpenChange={setConfirmDelete}
      title="Clear this slot?"
      description={`Remove the ${existing?.subjectName ?? ''} lesson from ${DAY_LABELS[day]}${period ? ` ${period.name}` : ''}.`}
      confirmLabel="Clear slot" destructive
      onConfirm={async () => { await remove.mutateAsync() }}
    />
    </>
  )
}

// ── copy dialog ─────────────────────────────────────────────────────────────
function CopyDialog({ open, onOpenChange, targetClassId, targetSectionId, classes, termId }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  targetClassId: string
  targetSectionId: string | null
  classes: ClassRow[]
  termId: string | null
}) {
  const qc = useQueryClient()
  const [fromClassId, setFromClassId] = useState('NONE')
  const [fromSectionId, setFromSectionId] = useState('ALL')

  const fromClass = classes.find(c => c.id === fromClassId)

  const run = useMutation({
    mutationFn: () => api('/timetable/copy', {
      method: 'POST',
      body: {
        termId, fromClassId,
        fromSectionId: fromSectionId === 'ALL' ? null : fromSectionId,
        toClassId: targetClassId, toSectionId: targetSectionId,
      },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['timetable'] })
      const res = r as { copied: number; skipped: number; teachersCleared: number }
      toast.success(`Copied ${res.copied} slots` +
        (res.skipped ? ` — ${res.skipped} skipped (subject missing on this class)` : '') +
        (res.teachersCleared ? ` — ${res.teachersCleared} teacher(s) cleared (double-booked)` : ''))
      onOpenChange(false)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Copy failed'),
  })

  return (
    <Dialog open={open} onOpenChange={o => { if (!run.isPending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy a timetable here</DialogTitle>
          <DialogDescription>
            The target grid must be empty. Subjects missing on this class are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>From class</Label>
            <Select value={fromClassId} onValueChange={v => { setFromClassId(v); setFromSectionId('ALL') }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a source class" /></SelectTrigger>
              <SelectContent>
                {classes.filter(c => c.id !== targetClassId).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fromClass && fromClass.sections.length > 0 && (
            <div className="space-y-1.5">
              <Label>From section</Label>
              <Select value={fromSectionId} onValueChange={setFromSectionId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Whole class</SelectItem>
                  {fromClass.sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || fromClassId === 'NONE' || !termId}>
            {run.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Copy aria-hidden /> Copy timetable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── main tab ────────────────────────────────────────────────────────────────
export function ClassGridTab({ canWrite }: { canWrite: boolean }) {
  const [classId, setClassId] = useState('NONE')
  const [sectionId, setSectionId] = useState('ALL')
  const [termId, setTermId] = useState('CURRENT')

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])
  const selectedClass = classes.find(c => c.id === classId)

  const { data: sessionsData } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => api<{ items: (TermRow & { terms: TermRow[] })[] }>('/academics/sessions'),
  })
  const terms = useMemo(() => (sessionsData?.items ?? []).flatMap(s => s.terms), [sessionsData])
  const effectiveTermId = termId === 'CURRENT' ? (terms.find(t => t.isCurrent)?.id ?? null) : termId
  const activeTerm = terms.find(t => t.id === effectiveTermId)

  const { data, isLoading } = useQuery({
    queryKey: qk.timetableGrid(effectiveTermId ?? undefined, classId, sectionId),
    queryFn: () => api<GridPayload>('/timetable/grid', {
      query: {
        classId,
        termId: effectiveTermId ?? undefined,
        sectionId: sectionId === 'ALL' ? undefined : sectionId,
      },
    }),
    enabled: classId !== 'NONE',
  })

  const periodIndex = useMemo(() => new Map((data?.periods ?? []).map(p => [p.id, p])), [data])
  const slotIndex = useMemo(() => {
    const m = new Map<string, SlotW>()
    for (const s of data?.slots ?? []) m.set(`${s.day}:${s.periodId}`, s)
    return m
  }, [data])

  const teachingDays = useMemo(() => {
    const set = new Set((data?.slots ?? []).map(s => s.day))
    return set.has(5) ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]
  }, [data])

  // teaching periods in order + break rows interleaved by order value
  const rows = useMemo(() => {
    const periods = (data?.periods ?? []).slice().sort((a, b) => a.order - b.order)
    return periods
  }, [data])

  const [slotDialog, setSlotDialog] = useState<{ day: number; period: PeriodW; existing: SlotW | null } | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)

  const slotCount = data?.slots.length ?? 0

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      {/* pickers */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-52">
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
          <div className="w-full space-y-1.5 sm:w-40">
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
        <div className="flex flex-1 items-center justify-end gap-2">
          <Badge variant="secondary" className="shrink-0">{slotCount} slot{slotCount === 1 ? '' : 's'}</Badge>
          {canWrite && classId !== 'NONE' && (
            <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)} disabled={!effectiveTermId}>
              <Copy aria-hidden /> Copy…
            </Button>
          )}
        </div>
      </div>

      {activeTerm && !activeTerm.isCurrent && (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertDescription>
            You are editing a past or future term — the current term is shown by default.
          </AlertDescription>
        </Alert>
      )}

      {/* grid */}
      {classId === 'NONE' ? (
        <EmptyState
          icon={Grid3X3}
          title="Pick a class"
          description="Choose a class to view or edit its weekly timetable."
        />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card [scrollbar-width:thin]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="sticky left-0 z-10 w-36 bg-muted/80 px-3 py-2.5 text-left font-medium backdrop-blur">Period</th>
                {teachingDays.map(d => (
                  <th key={d} className="px-3 py-2.5 text-left font-medium">{DAY_LABELS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-b last:border-0">
                  <th className={`sticky left-0 z-10 px-3 py-2 text-left font-medium backdrop-blur ${p.isBreak ? 'bg-amber-50/80 dark:bg-amber-950/40' : 'bg-muted/40'}`}>
                    <span className="block">{p.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{p.startTime}–{p.endTime}</span>
                  </th>
                  {p.isBreak ? (
                    <td colSpan={teachingDays.length} className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <Coffee className="h-3.5 w-3.5" aria-hidden /> Break — not scheduled
                      </span>
                    </td>
                  ) : teachingDays.map(d => {
                    const slot = slotIndex.get(`${d}:${p.id}`)
                    const key = `${d}-${p.id}`
                    if (!slot) {
                      return (
                        <td key={key} className="px-1.5 py-1.5">
                          {canWrite ? (
                            <button
                              type="button"
                              className="group flex h-14 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground/0 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary/60"
                              onClick={() => setSlotDialog({ day: d, period: p, existing: null })}
                              aria-label={`Schedule lesson ${DAY_LABELS[d]} ${p.name}`}
                            >
                              <Plus className="h-4 w-4" aria-hidden />
                            </button>
                          ) : <div className="h-14" aria-hidden />}
                        </td>
                      )
                    }
                    return (
                      <td key={key} className="px-1.5 py-1.5">
                        <button
                          type="button"
                          className="flex h-14 w-full flex-col items-start justify-center gap-0.5 rounded-md border border-primary/20 bg-primary/5 px-2 text-left transition-colors hover:bg-primary/10"
                          onClick={() => setSlotDialog({ day: d, period: p, existing: slot })}
                          aria-label={`${slot.subjectName ?? 'Free'} — ${slot.teacherName ?? 'no teacher'}, ${DAY_LABELS[d]} ${p.name}`}
                        >
                          <span className="line-clamp-1 text-xs font-semibold text-foreground">
                            {slot.subjectName ?? 'Free'}
                          </span>
                          <span className="line-clamp-1 text-[11px] text-muted-foreground">
                            {slot.teacherName ?? 'No teacher'}
                          </span>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={teachingDays.length + 1} className="px-3 py-10 text-center text-muted-foreground">
                    No periods defined yet — set them up in the Periods tab first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {slotDialog && (
        <SlotDialog
          open onOpenChange={o => { if (!o) setSlotDialog(null) }}
          day={slotDialog.day}
          period={slotDialog.period}
          existing={slotDialog.existing}
          termId={effectiveTermId}
          classId={classId}
          sectionId={sectionId === 'ALL' ? null : sectionId}
          allSlots={data?.allSlots ?? []}
          classSubjects={data?.classSubjects ?? []}
          teachers={data?.teachers ?? []}
          canWrite={canWrite}
        />
      )}

      {copyOpen && classId !== 'NONE' && (
        <CopyDialog
          open onOpenChange={setCopyOpen}
          targetClassId={classId}
          targetSectionId={sectionId === 'ALL' ? null : sectionId}
          classes={classes}
          termId={effectiveTermId}
        />
      )}
    </motion.div>
  )
}
