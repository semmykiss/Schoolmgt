'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { FileSpreadsheet, Loader2, Lock, Save } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { gradeFor, type GradeBandLike } from '@/lib/domain/grading'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { gradeTone } from './exam-helpers'

interface SheetPayload {
  exam: { id: string; name: string; publishResults: boolean }
  subject: { id: string; name: string; code: string | null }
  class: { id: string; name: string }
  schedule: { id: string | null; date: string | null; maxMarks: number; passMarks: number }
  bands: GradeBandLike[]
  roster: {
    studentId: string
    admissionNumber: string
    fullName: string
    marks: number | null
    grade: string | null
    remark: string | null
    savedAt: string | null
  }[]
}
interface ExamListRow { id: string; name: string; term: { name: string; session: { name: string } }; publishResults: boolean }
interface ExamDetail { id: string; schedules: { classSubjectId: string; classSubject: { subject: { name: string; code: string | null }; class: { id: string; name: string } } }[] }
interface ClassRow { id: string; name: string; level: number; sections: { id: string; name: string }[] }

type Draft = Record<string, string>

export function MarksTab({ canMark }: { canMark: boolean }) {
  const qc = useQueryClient()
  const [examId, setExamId] = useState('NONE')
  const [classId, setClassId] = useState('NONE')
  const [classSubjectId, setClassSubjectId] = useState('NONE')
  const [draft, setDraft] = useState<Draft>({})
  const [dirty, setDirty] = useState(false)

  const { data: examsData } = useQuery({
    queryKey: qk.exams(),
    queryFn: () => api<{ items: ExamListRow[] }>('/exams', { query: { pageSize: 100 } }),
  })
  const exams = useMemo(() => examsData?.items ?? [], [examsData])

  const { data: examDetail } = useQuery({
    queryKey: qk.exam(examId === 'NONE' ? undefined : examId),
    queryFn: () => api<ExamDetail>(`/exams/${examId}`),
    enabled: examId !== 'NONE',
  })

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])

  // Papers scheduled in this exam, grouped by class
  const papersByClass = useMemo(() => {
    const map = new Map<string, { classSubjectId: string; subjectName: string; subjectCode: string | null }[]>()
    for (const s of examDetail?.schedules ?? []) {
      const key = s.classSubject.class.id
      const list = map.get(key) ?? []
      list.push({ classSubjectId: s.classSubjectId, subjectName: s.classSubject.subject.name, subjectCode: s.classSubject.subject.code })
      map.set(key, list)
    }
    return map
  }, [examDetail])
  const paperClasses = useMemo(
    () => classes.filter(c => papersByClass.has(c.id)).map(c => ({ ...c, papers: papersByClass.get(c.id)! })),
    [classes, papersByClass],
  )
  const selectedClass = paperClasses.find(c => c.id === classId)

  const sheetKey = qk.marksSheet(examId === 'NONE' ? undefined : examId, classSubjectId === 'NONE' ? undefined : classSubjectId)
  const { data: sheet, isLoading, isFetching } = useQuery({
    queryKey: sheetKey,
    queryFn: () => api<SheetPayload>(`/exams/${examId}/marks-sheet`, { query: { classSubjectId } }),
    enabled: examId !== 'NONE' && classSubjectId !== 'NONE',
  })

  // Seed draft when the sheet changes
  const [seededKey, setSeededKey] = useState('')
  const seedId = sheetKey.join('|')
  if (sheet && seededKey !== seedId) {
    setSeededKey(seedId)
    const next: Draft = {}
    for (const r of sheet.roster) next[r.studentId] = r.marks === null ? '' : String(r.marks)
    setDraft(next)
    setDirty(false)
  }

  const previewGrade = (raw: string): { grade: string | null; remark: string | null } => {
    if (!sheet) return { grade: null, remark: null }
    const n = Number(raw)
    if (!raw.trim() || !Number.isFinite(n) || n < 0) return { grade: null, remark: null }
    const band = gradeFor(Math.min(n, sheet.schedule.maxMarks), sheet.schedule.maxMarks, sheet.bands)
    return { grade: band?.grade ?? null, remark: band?.remark ?? null }
  }

  const counts = useMemo(() => {
    const entered = Object.values(draft).filter(v => v.trim() !== '' && Number.isFinite(Number(v))).length
    const failing = Object.entries(draft).filter(([id, v]) => {
      const n = Number(v)
      return v.trim() !== '' && Number.isFinite(n) && n < (sheet?.schedule.passMarks ?? 0)
    }).length
    return { entered, total: sheet?.roster.length ?? 0, failing }
  }, [draft, sheet])

  const save = useMutation({
    mutationFn: () => {
      if (!sheet) throw new Error('Sheet not loaded')
      const rows = sheet.roster
        .filter(r => draft[r.studentId]?.trim() !== '')
        .map(r => ({ studentId: r.studentId, marks: Number(draft[r.studentId]) }))
      if (rows.length === 0) throw new Error('Enter at least one score')
      return api<{ saved: number; graded: number }>(`/exams/${examId}/marks-sheet`, {
        method: 'POST',
        body: { classSubjectId, maxMarks: sheet.schedule.maxMarks, rows },
      })
    },
    onSuccess: r => {
      void qc.invalidateQueries({ queryKey: ['exams'] })
      setDirty(false)
      toast.success(`Saved ${r.saved} score${r.saved === 1 ? '' : 's'} — ${r.graded} auto-graded`)
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const setMark = (id: string, v: string) => {
    // allow only digits and one decimal point, then clamp to maxMarks
    if (v !== '' && !/^\d{0,3}(\.\d{0,1})?$/.test(v)) return
    const max = sheet?.schedule.maxMarks ?? 100
    const n = Number(v)
    if (v !== '' && Number.isFinite(n) && n > max) v = String(max)
    setDraft(d => ({ ...d, [id]: v }))
    setDirty(true)
  }

  const locked = sheet?.exam.publishResults ?? false

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      {/* pickers */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={v => { setExamId(v); setClassSubjectId('NONE') }}>
            <SelectTrigger aria-label="Select exam"><SelectValue placeholder="Pick an exam" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" disabled>Pick an exam</SelectItem>
              {exams.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {TERM_LABEL[e.term.name] ?? e.term.name} · {e.term.session.name} — {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {examId !== 'NONE' && (
          <div className="w-full space-y-1.5 sm:w-48">
            <Label>Class</Label>
            <Select value={classId} onValueChange={v => { setClassId(v); setClassSubjectId('NONE') }}>
              <SelectTrigger aria-label="Select class"><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>
                {paperClasses.length === 0
                  ? <SelectItem value="NONE" disabled>No papers scheduled yet</SelectItem>
                  : paperClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {selectedClass && (
          <div className="w-full space-y-1.5 sm:w-56">
            <Label>Subject</Label>
            <Select value={classSubjectId} onValueChange={setClassSubjectId}>
              <SelectTrigger aria-label="Select subject"><SelectValue placeholder="Pick a subject" /></SelectTrigger>
              <SelectContent>
                {selectedClass.papers.map(p => (
                  <SelectItem key={p.classSubjectId} value={p.classSubjectId}>
                    {p.subjectName}{p.subjectCode ? ` (${p.subjectCode})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {examId === 'NONE' ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Pick an exam"
          description="Choose an exam, then the class and subject to open its marks sheet."
        />
      ) : selectedClass && papersByClass.get(classId)!.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No papers scheduled" description="Add papers for this class from an exam's timetable first." />
      ) : sheet && locked ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <Lock className="h-5 w-5 shrink-0" aria-hidden />
          Results are published for this exam — scores are locked. Unpublish from the Exams tab to edit.
        </div>
      ) : sheet ? (
        <div className="space-y-3">
          {/* header strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
            <span className="text-sm font-medium">{sheet.subject.name}</span>
            {sheet.subject.code && <Badge variant="outline">{sheet.subject.code}</Badge>}
            <Badge variant="outline">{sheet.class.name}</Badge>
            <span className="text-xs text-muted-foreground">
              Max {sheet.schedule.maxMarks} · Pass {sheet.schedule.passMarks}
              {sheet.schedule.date ? ` · ${sheet.schedule.date}` : ''}
            </span>
            <span className="flex-1" />
            {!dirty && sheet.roster.some(r => r.savedAt) && (
              <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">Saved</Badge>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {counts.entered}/{counts.total} entered{counts.failing > 0 ? ` · ${counts.failing} below pass` : ''}
            </span>
          </div>

          {/* roster */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y" role="list" aria-label="Marks sheet">
              {sheet.roster.map((s, i) => {
                const raw = draft[s.studentId] ?? ''
                const preview = previewGrade(raw)
                const num = Number(raw)
                const belowPass = raw.trim() !== '' && Number.isFinite(num) && num < sheet.schedule.passMarks
                return (
                  <li key={s.studentId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.admissionNumber}</p>
                    </div>
                    {canMark ? (
                      <>
                        <div className="flex w-full items-center gap-2 sm:w-52">
                          <Input
                            inputMode="decimal"
                            placeholder="—"
                            value={raw}
                            onChange={e => setMark(s.studentId, e.target.value)}
                            className={cn('h-9 w-24 text-right tabular-nums', belowPass && 'border-destructive/50')}
                            aria-label={`Score for ${s.fullName} (out of ${sheet.schedule.maxMarks})`}
                          />
                          <div className="min-w-0">
                            <span className={cn('block text-sm', gradeTone(preview.grade))}>{preview.grade ?? '—'}</span>
                            <span className="block truncate text-xs text-muted-foreground">{preview.remark ?? ' '}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{s.marks ?? '—'}</span>
                        <span className={cn('text-sm', gradeTone(s.grade))}>{s.grade ?? ''}</span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {canMark && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {isFetching ? 'Refreshing…' : 'Grades are assigned automatically from the default grading scale when you save.'}
              </p>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty || counts.entered === 0}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {dirty ? `Save ${counts.entered} score${counts.entered === 1 ? '' : 's'}` : 'Saved'}
              </Button>
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : classSubjectId === 'NONE' ? (
        <EmptyState icon={FileSpreadsheet} title="Pick a subject" description="Choose the paper you want to enter scores for." />
      ) : null}
    </motion.div>
  )
}
