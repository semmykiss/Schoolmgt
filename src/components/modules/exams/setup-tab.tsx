'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2, Gauge, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { FieldError } from '@/components/shared/field-error'
import { gradeTone } from './exam-helpers'

interface ExamTypeRow { id: string; name: string; weight: number; _count: { exams: number } }
interface BandRow { id: string; grade: string; minScore: number; maxScore: number; remark: string; points: number | null }
interface ScaleRow { id: string; name: string; isDefault: boolean; bands: BandRow[] }

// ── Exam types ──────────────────────────────────────────────────────────────
const typeSchema = z.object({
  name: z.string().min(2, 'Name is required').max(80),
  weight: z.coerce.number({ invalid_type_error: 'Enter a number' }).int().min(1, 'Between 1 and 100').max(100, 'Between 1 and 100'),
})
type TypeForm = z.infer<typeof typeSchema>

function ExamTypesCard({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExamTypeRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExamTypeRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.examTypes(),
    queryFn: () => api<{ items: ExamTypeRow[] }>('/exams/exam-types'),
  })
  const types = data?.items ?? []

  const form = useForm<TypeForm>({
    resolver: zodResolver(typeSchema),
    defaultValues: { name: '', weight: 100 },
  })
  const [seededKey, setSeededKey] = useState('')
  const seedKey = `${open}:${editTarget?.id ?? 'new'}`
  if (open && seededKey !== seedKey) {
    setSeededKey(seedKey)
    form.reset(editTarget ? { name: editTarget.name, weight: editTarget.weight } : { name: '', weight: 100 })
  }

  const save = useMutation({
    mutationFn: (v: TypeForm) =>
      editTarget
        ? api(`/exams/exam-types/${editTarget.id}`, { method: 'PATCH', body: v })
        : api('/exams/exam-types', { method: 'POST', body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      setOpen(false)
      toast.success(editTarget ? 'Exam type updated' : 'Exam type created')
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/exams/exam-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams'] }); setDeleteTarget(null); toast.success('Exam type deleted') },
    onError: e => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="exam-types-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 id="exam-types-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" aria-hidden /> Exam types
          </h2>
          <p className="text-xs text-muted-foreground">Mid-term, CA, final exam… each with its weight</p>
        </div>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => { setEditTarget(null); setOpen(true) }}>
            <Plus aria-hidden /> Add type
          </Button>
        )}
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : types.length === 0 ? (
          <EmptyState icon={Layers} title="No exam types" description="Add types like “Mid-Term Test” or “Final Term Exam”." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {types.map(t => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t._count.exams} exam{t._count.exams === 1 ? '' : 's'} use this type</p>
                </div>
                <Badge variant="outline" className="tabular-nums">{t.weight}%</Badge>
                {canWrite && (
                  <>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => { setEditTarget(t); setOpen(true) }}>
                      <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${t.name}`} onClick={() => setDeleteTarget(t)} disabled={t._count.exams > 0}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) form.reset() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit exam type' : 'New exam type'}</DialogTitle>
            <DialogDescription>Type name and how much it counts, e.g. “Mid-Term Test — 30%”.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="et-name">Name</Label>
              <Input id="et-name" {...form.register('name')} aria-invalid={!!form.formState.errors.name} />
              <FieldError error={form.formState.errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-weight">Weight (%)</Label>
              <Input id="et-weight" type="number" min={1} max={100} {...form.register('weight')} aria-invalid={!!form.formState.errors.weight} />
              <FieldError error={form.formState.errors.weight?.message} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Exam types in use cannot be deleted."
        confirmLabel="Delete type"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </section>
  )
}

// ── Grading scales ──────────────────────────────────────────────────────────
const bandSchema = z.object({
  grade: z.string().min(1, 'Required').max(8),
  minScore: z.coerce.number({ invalid_type_error: '0–100' }).int().min(0).max(100),
  maxScore: z.coerce.number({ invalid_type_error: '0–100' }).int().min(0).max(100),
  remark: z.string().min(1, 'Required').max(40),
})
const scaleSchema = z.object({
  name: z.string().min(2, 'Name is required').max(80),
  isDefault: z.boolean(),
  bands: z.array(bandSchema).min(1, 'Add at least one band'),
})
type ScaleForm = z.infer<typeof scaleSchema>

function GradingScalesCard({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ScaleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScaleRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.gradingScales(),
    queryFn: () => api<{ items: ScaleRow[] }>('/exams/grading-scales'),
  })
  const scales = data?.items ?? []

  const form = useForm<ScaleForm>({
    resolver: zodResolver(scaleSchema),
    defaultValues: { name: '', isDefault: false, bands: [] },
  })
  const bands = form.watch('bands')

  const [seededKey, setSeededKey] = useState('')
  const seedKey = `${open}:${editTarget?.id ?? 'new'}`
  if (open && seededKey !== seedKey) {
    setSeededKey(seedKey)
    form.reset(editTarget
      ? { name: editTarget.name, isDefault: editTarget.isDefault, bands: editTarget.bands.map(b => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore, remark: b.remark })) }
      : { name: '', isDefault: false, bands: [] })
  }

  const save = useMutation({
    mutationFn: (v: ScaleForm) =>
      editTarget
        ? api(`/exams/grading-scales/${editTarget.id}`, { method: 'PATCH', body: v })
        : api('/exams/grading-scales', { method: 'POST', body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      setOpen(false)
      toast.success(editTarget ? 'Grading scale updated' : 'Grading scale created')
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/exams/grading-scales/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams'] }); setDeleteTarget(null); toast.success('Grading scale deleted') },
    onError: e => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => api(`/exams/grading-scales/${id}`, { method: 'PATCH', body: { isDefault: true } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams'] }); toast.success('Default grading scale updated') },
    onError: e => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const addBand = () => form.setValue('bands', [...bands, { grade: '', minScore: 0, maxScore: 0, remark: '' }], { shouldValidate: false })

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="grading-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 id="grading-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-primary" aria-hidden /> Grading scales
          </h2>
          <p className="text-xs text-muted-foreground">The default scale grades every score automatically</p>
        </div>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => { setEditTarget(null); setOpen(true) }}>
            <Plus aria-hidden /> Add scale
          </Button>
        )}
      </div>
      <div className="space-y-3 p-4">
        {isLoading ? (
          <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : scales.length === 0 ? (
          <EmptyState icon={Gauge} title="No grading scales" description="Create one — e.g. the WAEC standard (A1–F9)." />
        ) : (
          scales.map(s => (
            <div key={s.id} className={`rounded-lg border p-3 ${s.isDefault ? 'border-primary/40 bg-primary/5' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{s.name}</p>
                {s.isDefault && <Badge className="bg-primary/15 text-primary"><CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> Default</Badge>}
                <span className="flex-1" />
                {canWrite && !s.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(s.id)} disabled={setDefault.isPending}>
                    Make default
                  </Button>
                )}
                {canWrite && (
                  <>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => { setEditTarget(s); setOpen(true) }}>
                      <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setDeleteTarget(s)} disabled={s.isDefault}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.bands.map(b => (
                  <Badge key={b.id} variant="outline" className="gap-1.5 text-xs">
                    <span className={gradeTone(b.grade)}>{b.grade}</span>
                    <span className="text-muted-foreground tabular-nums">{b.minScore}–{b.maxScore}</span>
                    <span className="text-muted-foreground/70">{b.remark}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) form.reset() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit grading scale' : 'New grading scale'}</DialogTitle>
            <DialogDescription>Define bands from highest to lowest, e.g. A1: 75–100 Excellent.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(v => save.mutate(v))} noValidate>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="gs-name">Scale name</Label>
                <Input id="gs-name" placeholder="WAEC Standard" {...form.register('name')} aria-invalid={!!form.formState.errors.name} />
                <FieldError error={form.formState.errors.name?.message} />
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-sm">
                <Switch
                  checked={form.watch('isDefault')}
                  onCheckedChange={v => form.setValue('isDefault', v)}
                  aria-label="Set as default grading scale"
                />
                Default scale
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Grade bands</Label>
                <Button type="button" variant="outline" size="sm" onClick={addBand}><Plus aria-hidden /> Add band</Button>
              </div>
              {typeof form.formState.errors.bands?.message === 'string' && (
                <p className="text-sm text-destructive">{form.formState.errors.bands.message}</p>
              )}
              {bands.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No bands yet — add A1, B2, B3…</p>
              )}
              <div className="space-y-2">
                {bands.map((b, i) => {
                  const err = (form.formState.errors.bands as { [k: string]: { grade?: { message?: string }; minScore?: { message?: string }; maxScore?: { message?: string }; remark?: { message?: string } } | undefined } | undefined)?.[i]
                  return (
                    <div key={i} className="grid grid-cols-[70px_80px_80px_1fr_36px] items-start gap-2">
                      <div>
                        <Input placeholder="A1" {...form.register(`bands.${i}.grade`)} aria-label={`Band ${i + 1} grade`} />
                        <FieldError error={err?.grade?.message} />
                      </div>
                      <div>
                        <Input type="number" placeholder="Min" {...form.register(`bands.${i}.minScore`)} aria-label={`Band ${i + 1} minimum score`} />
                        <FieldError error={err?.minScore?.message} />
                      </div>
                      <div>
                        <Input type="number" placeholder="Max" {...form.register(`bands.${i}.maxScore`)} aria-label={`Band ${i + 1} maximum score`} />
                        <FieldError error={err?.maxScore?.message} />
                      </div>
                      <div>
                        <Input placeholder="Remark e.g. Excellent" {...form.register(`bands.${i}.remark`)} aria-label={`Band ${i + 1} remark`} />
                        <FieldError error={err?.remark?.message} />
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon"
                        aria-label={`Remove band ${i + 1}`}
                        onClick={() => form.setValue('bands', bands.filter((_, j) => j !== i), { shouldValidate: false })}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save scale
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Scores already graded keep their saved grades; future entries will lose auto-grading."
        confirmLabel="Delete scale"
        destructive
        onConfirm={async () => { if (deleteTarget) await remove.mutateAsync(deleteTarget.id) }}
      />
    </section>
  )
}

export function SetupTab({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ExamTypesCard canWrite={canWrite} />
      <GradingScalesCard canWrite={canWrite} />
    </div>
  )
}
