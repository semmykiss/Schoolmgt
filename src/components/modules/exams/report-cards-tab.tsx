'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, Loader2, MessageSquareText, ScrollText, Send } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { TERM_LABEL } from '@/components/modules/academics/academic-helpers'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import { ReportCardPrint } from './report-card-print'
import { gradeTone, ordinal, fmtNum } from './exam-helpers'

interface CardRow {
  id: string
  totalScore: number
  average: number
  position: number
  grade: string | null
  teacherRemark: string | null
  principalRemark: string | null
  published: boolean
  student: { id: string; admissionNumber: string; firstName: string; lastName: string; class: { name: string } | null }
}
interface ExamListRow { id: string; name: string; term: { name: string; session: { name: string } }; publishResults: boolean }
interface ClassRow { id: string; name: string; level: number }

export function ReportCardsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [examId, setExamId] = useState('NONE')
  const [classId, setClassId] = useState('NONE')
  const [printTarget, setPrintTarget] = useState<{ examId: string; studentId: string } | null>(null)
  const [remarkTarget, setRemarkTarget] = useState<CardRow | null>(null)

  const { data: examsData } = useQuery({
    queryKey: qk.exams(),
    queryFn: () => api<{ items: ExamListRow[] }>('/exams', { query: { pageSize: 100 } }),
  })
  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: ClassRow[] }>('/academics/classes'),
  })
  const classes = useMemo(() => (classesData?.items ?? []).slice().sort((a, b) => a.level - b.level), [classesData])

  const listKey = qk.reportCards(examId === 'NONE' ? undefined : examId, classId === 'NONE' ? undefined : classId)
  const { data, isLoading, error } = useQuery({
    queryKey: listKey,
    queryFn: () => api<{ items: CardRow[] }>('/report-cards', { query: { examId, classId } }),
    enabled: examId !== 'NONE' && classId !== 'NONE',
    retry: false,
  })
  const cards = useMemo(() => data?.items ?? [], [data])

  const togglePublish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      api(`/report-cards/${id}`, { method: 'PATCH', body: { published } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exams'] }),
    onError: e => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
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
      </div>

      {examId === 'NONE' || classId === 'NONE' ? (
        <EmptyState
          icon={ScrollText}
          title="Pick an exam and a class"
          description="Report cards are generated from the Broadsheet tab, then printed or published here."
        />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load report cards'}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No report cards yet"
          description="Generate them from the Broadsheet tab once marks are entered."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y" role="list" aria-label="Report cards">
            {cards.map(c => (
              <li key={c.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
                <span className={cn('w-12 shrink-0 text-center text-sm', gradeTone(null))} aria-hidden>
                  {ordinal(c.position)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.student.firstName} {c.student.lastName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.student.admissionNumber} · Avg {fmtNum(c.average, 1)}% · {c.student.class?.name ?? ''}
                  </p>
                </div>
                <span className={cn('text-sm font-semibold', gradeTone(c.grade))}>{c.grade ?? '—'}</span>
                {canWrite ? (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={c.published}
                      onCheckedChange={v => togglePublish.mutate({ id: c.id, published: v })}
                      disabled={togglePublish.isPending}
                      aria-label={`Publish report card for ${c.student.firstName}`}
                    />
                    {c.published ? 'Published' : 'Draft'}
                  </label>
                ) : (
                  <Badge variant={c.published ? 'secondary' : 'outline'} className={c.published ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                    {c.published ? 'Published' : 'Draft'}
                  </Badge>
                )}
                <div className="flex justify-end gap-1">
                  {canWrite && (
                    <Button variant="ghost" size="icon" aria-label={`Edit remarks for ${c.student.firstName}`} onClick={() => setRemarkTarget(c)}>
                      <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label={`Print report card for ${c.student.firstName}`} onClick={() => setPrintTarget({ examId, studentId: c.student.id })}>
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {printTarget && (
        <ReportCardPrint
          examId={printTarget.examId}
          studentId={printTarget.studentId}
          onClose={() => setPrintTarget(null)}
        />
      )}

      <RemarkDialog
        target={remarkTarget}
        onOpenChange={o => { if (!o) setRemarkTarget(null) }}
        canWrite={canWrite}
      />
    </motion.div>
  )
}

function RemarkDialog({ target, onOpenChange, canWrite }: {
  target: CardRow | null
  onOpenChange: (o: boolean) => void
  canWrite: boolean
}) {
  const qc = useQueryClient()
  const [teacherRemark, setTeacherRemark] = useState('')
  const [principalRemark, setPrincipalRemark] = useState('')

  const [seededId, setSeededId] = useState('')
  if (target && seededId !== target.id) {
    setSeededId(target.id)
    setTeacherRemark(target.teacherRemark ?? '')
    setPrincipalRemark(target.principalRemark ?? '')
  }

  const save = useMutation({
    mutationFn: () => api(`/report-cards/${target!.id}`, {
      method: 'PATCH',
      body: { teacherRemark: teacherRemark.trim() || null, principalRemark: principalRemark.trim() || null },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exams'] })
      onOpenChange()
      toast.success('Remarks saved')
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report card remarks</DialogTitle>
          <DialogDescription>
            {target ? `${target.student.firstName} ${target.student.lastName} — position ${ordinal(target.position)}, average ${fmtNum(target.average, 1)}%` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="teacher-remark">Form teacher&apos;s remark</Label>
            <Textarea
              id="teacher-remark" rows={3}
              value={teacherRemark} onChange={e => setTeacherRemark(e.target.value)}
              placeholder={canWrite ? 'e.g. A hardworking student — keep it up!' : undefined}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="principal-remark">Principal&apos;s remark</Label>
            <Textarea
              id="principal-remark" rows={3}
              value={principalRemark} onChange={e => setPrincipalRemark(e.target.value)}
              placeholder={canWrite ? 'e.g. Commended performance.' : undefined}
              disabled={!canWrite}
            />
          </div>
          {canWrite && (
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={target?.published ?? false}
                onCheckedChange={v => {
                  if (!target) return
                  api(`/report-cards/${target.id}`, { method: 'PATCH', body: { published: v } })
                    .then(() => { void qc.invalidateQueries({ queryKey: ['exams'] }); toast.success(v ? 'Published to portals' : 'Unpublished') })
                    .catch(e => toast.error(e instanceof Error ? e.message : 'Failed'))
                }}
                aria-label="Publish this report card"
              />
              <Send className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {target?.published ? 'Visible to parent & student' : 'Hidden from portals'}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {canWrite && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save remarks
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
