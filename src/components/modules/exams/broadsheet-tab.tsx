'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Download, Grid3x3, Loader2, Sparkles } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { gradeTone, ordinal, fmtNum, downloadCsv } from './exam-helpers'

interface BroadsheetCell { marksObtained: number; maxMarks: number; grade: string | null; remark: string | null }
interface BroadsheetRow {
  studentId: string
  admissionNumber: string
  fullName: string
  subjects: (BroadsheetCell | null)[]
  total: number
  scoredSubjects: number
  average: number | null
  position: number | null
  grade: string | null
  livePosition: number | null
  reportCardExists: boolean
}
interface BroadsheetPayload {
  exam: { id: string; name: string; publishResults: boolean }
  class: { id: string; name: string }
  columns: { classSubjectId: string; subjectName: string; subjectCode: string | null; maxMarks: number; passMarks: number }[]
  rows: BroadsheetRow[]
  subjectStats: { classSubjectId: string; count: number; average: number | null; passRate: number | null }[]
  reportCardsGenerated: number
  published: boolean
}
interface ExamListRow { id: string; name: string; term: { name: string; session: { name: string } } }
interface ClassRow { id: string; name: string; level: number }

export function BroadsheetTab({ canWrite, onGoReports }: { canWrite: boolean; onGoReports: () => void }) {
  const qc = useQueryClient()
  const [examId, setExamId] = useState('NONE')
  const [classId, setClassId] = useState('NONE')
  const [generateOpen, setGenerateOpen] = useState(false)

  const { data: examsData } = useQuery({
    queryKey: qk.exams(),
    queryFn: () => api<{ items: ExamListRow[] }>('/exams', { query: { pageSize: 100 } }),
  })
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])

  const sheetKey = qk.broadsheet(examId === 'NONE' ? undefined : examId, classId === 'NONE' ? undefined : classId)
  const { data: sheet, isLoading, isFetching, error } = useQuery({
    queryKey: sheetKey,
    queryFn: () => api<BroadsheetPayload>('/exams/broadsheet', { query: { examId, classId } }),
    enabled: examId !== 'NONE' && classId !== 'NONE',
    retry: false,
  })

  const generate = useMutation({
    mutationFn: () => api<{ generated: number }>('/report-cards', { method: 'POST', body: { examId, classId } }),
    onSuccess: r => {
      void qc.invalidateQueries({ queryKey: ['exams'] })
      setGenerateOpen(false)
      toast.success(`${r.generated} report card${r.generated === 1 ? '' : 's'} generated`)
      onGoReports()
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Generation failed'),
  })

  const exportCsv = () => {
    if (!sheet) return
    const headers = ['Admission No', 'Student', ...sheet.columns.map(c => `${c.subjectName} (/${c.maxMarks})`), 'Total', 'Average', 'Position', 'Grade']
    const rows = sheet.rows.map(r => [
      r.admissionNumber, r.fullName,
      ...r.subjects.map(c => c ? c.marksObtained : ''),
      r.scoredSubjects > 0 ? r.total : '',
      r.average ?? '',
      r.position ?? r.livePosition ?? '',
      r.grade ?? '',
    ])
    downloadCsv(`broadsheet-${sheet.class.name.toLowerCase().replace(/\s+/g, '-')}.csv`, headers, rows)
  }

  const ready = sheet && sheet.columns.length > 0

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={v => setExamId(v)}>
            <SelectTrigger aria-label="Select exam"><SelectValue placeholder="Pick an exam" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" disabled>Pick an exam</SelectItem>
              {(examsData?.items ?? []).map(e => (
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
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger aria-label="Select class"><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE" disabled>Pick a class</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {ready && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} aria-label="Export broadsheet as CSV">
              <Download aria-hidden /> CSV
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setGenerateOpen(true)} disabled={generate.isPending}>
                {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {sheet!.reportCardsGenerated > 0 ? 'Regenerate report cards' : 'Generate report cards'}
              </Button>
            )}
          </div>
        )}
      </div>

      {examId === 'NONE' || classId === 'NONE' ? (
        <EmptyState
          icon={Grid3x3}
          title="Pick an exam and a class"
          description="The broadsheet shows every student's scores across subjects with totals, averages and positions."
        />
      ) : isLoading || isFetching ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load the broadsheet'}
        </div>
      ) : sheet && sheet.columns.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="No papers scheduled"
          description={`No subjects are scheduled for ${sheet.class.name} in this exam yet. Add papers from the exam timetable.`}
        />
      ) : sheet ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
            <Badge variant="outline">{sheet.class.name}</Badge>
            <span className="text-xs text-muted-foreground">{sheet.columns.length} subjects · {sheet.rows.length} students</span>
            {sheet.reportCardsGenerated > 0 && (
              <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
                {sheet.reportCardsGenerated} report cards
              </Badge>
            )}
            {sheet.published && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Published</Badge>}
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">Class average:{' '}
              {fmtNum(
                sheet.rows.filter(r => r.average !== null).reduce((s, r) => s + (r.average ?? 0), 0) /
                Math.max(1, sheet.rows.filter(r => r.average !== null).length),
              )}
            </span>
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card [scrollbar-width:thin]">
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">#</th>
                  <th scope="col" className="min-w-40 px-3 py-2 text-left font-medium">Student</th>
                  {sheet.columns.map(c => (
                    <th key={c.classSubjectId} scope="col" className="px-2 py-2 text-center font-medium" title={`Pass mark ${c.passMarks}`}>
                      <span className="block max-w-24 truncate" title={c.subjectName}>{c.subjectName}</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">/{c.maxMarks}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Avg</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Pos</th>
                  <th scope="col" className="px-3 py-2 text-center font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sheet.rows.map((r, i) => (
                  <tr key={r.studentId} className="hover:bg-muted/40">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium leading-tight">{r.fullName}</p>
                      <p className="text-xs text-muted-foreground">{r.admissionNumber}</p>
                    </td>
                    {r.subjects.map((cell, j) => (
                      <td key={j} className="px-2 py-2 text-center tabular-nums">
                        {cell ? (
                          <span className={cn(
                            'inline-block rounded px-1.5 py-0.5',
                            cell.marksObtained < sheet!.columns[j].passMarks
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                          )}>
                            {cell.marksObtained}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.scoredSubjects > 0 ? r.total : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.average, 1)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', positionClass(r.position ?? r.livePosition))}>
                      {r.position ? ordinal(r.position) : r.livePosition ? `${ordinal(r.livePosition)}*` : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-center', gradeTone(r.grade))}>{r.grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-xs font-medium">Subject average / pass rate</td>
                  {sheet.subjectStats.map(st => (
                    <td key={st.classSubjectId} className="px-2 py-2 text-center text-xs tabular-nums">
                      {fmtNum(st.average, 1)}
                      {st.passRate !== null && <span className="block text-[10px] text-muted-foreground">{st.passRate}% pass</span>}
                    </td>
                  ))}
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            * Live position — computed from entered scores. Generate report cards to publish official positions.
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title="Generate report cards?"
        description={`Totals, averages and class positions will be computed for ${sheet?.rows.filter(r => r.scoredSubjects > 0).length ?? 0} students. Existing remarks are kept; positions refresh.`}
        confirmLabel="Generate"
        onConfirm={async () => { await generate.mutateAsync() }}
      />
    </motion.div>
  )
}

function positionClass(p: number | null | undefined): string {
  if (!p) return 'text-muted-foreground'
  if (p === 1) return 'font-bold text-amber-600 dark:text-amber-400'
  if (p <= 3) return 'font-semibold text-emerald-600 dark:text-emerald-400'
  return 'font-medium'
}
