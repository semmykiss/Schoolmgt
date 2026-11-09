'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle, GraduationCap, Loader2, PauseCircle, Rocket, TrendingUp,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import type { PlannedStudent, PromotionAction } from '@/lib/domain/promotion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'

interface PreviewResponse {
  className: string
  plan: PlannedStudent[]
  targetClasses: { id: string; name: string; level: number }[]
  warnings: string[]
  inactiveCount: number
}

const ACTION_META: Record<PromotionAction, { label: string; icon: typeof Rocket; classes: string }> = {
  PROMOTE: { label: 'Promote', icon: TrendingUp, classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  HOLD_BACK: { label: 'Hold back', icon: PauseCircle, classes: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  GRADUATE: { label: 'Graduate', icon: GraduationCap, classes: 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400' },
}

export function PromotionsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [classId, setClassId] = useState('')
  const [overrides, setOverrides] = useState<Record<string, { action: PromotionAction; toClassId: string | null }>>({})

  const { data: classesData } = useQuery({
    queryKey: qk.classes(),
    queryFn: () => api<{ items: { id: string; name: string; level: number; _count: { students: number } }[] }>('/academics/classes'),
  })
  const classes = classesData?.items ?? []
  const activeClasses = classes.filter(c => c._count.students > 0)
  // derived default — first class with students when nothing picked yet
  const selectedClassId = classId || activeClasses[0]?.id || ''

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: qk.promotionPreview(selectedClassId),
    queryFn: () => api<PreviewResponse>(`/academics/promotions?classId=${selectedClassId}`),
    enabled: !!selectedClassId,
  })

  // Overrides are keyed by studentId — switching classes leaves stale keys
  // behind harmlessly (different students), so no reset effect is needed.
  const effectivePlan = useMemo(() => {
    if (!preview) return []
    return preview.plan.map(p => {
      const o = overrides[p.id]
      return { ...p, action: o?.action ?? p.action, targetClassId: o?.toClassId ?? p.suggestedClassId }
    })
  }, [preview, overrides])

  const run = useMutation({
    mutationFn: () => api<{ promoted: number; held: number; graduated: number }>('/academics/promotions', {
      method: 'POST',
      body: {
        entries: effectivePlan.map(p => ({
          studentId: p.id,
          action: p.action,
          toClassId: p.action === 'PROMOTE' ? p.targetClassId : undefined,
        })),
      },
    }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['academic'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Promotion complete — ${r.promoted} promoted, ${r.held} held back, ${r.graduated} graduated`)
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Promotion failed'),
  })

  const stats = useMemo(() => ({
    promote: effectivePlan.filter(p => p.action === 'PROMOTE').length,
    hold: effectivePlan.filter(p => p.action === 'HOLD_BACK').length,
    graduate: effectivePlan.filter(p => p.action === 'GRADUATE').length,
  }), [effectivePlan])

  const setOverride = (id: string, patch: Partial<{ action: PromotionAction; toClassId: string | null }>) => {
    setOverrides(prev => {
      const suggested = preview?.plan.find(x => x.id === id)
      const cur = prev[id] ?? { action: suggested?.action ?? 'HOLD_BACK', toClassId: suggested?.suggestedClassId ?? null }
      const next = { ...cur, ...patch }
      if (next.action === 'PROMOTE' && !next.toClassId && suggested?.suggestedClassId) {
        next.toClassId = suggested.suggestedClassId
      }
      return { ...prev, [id]: next }
    })
  }

  if (activeClasses.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Nothing to promote"
        description="Promotion works per class — enrol students into classes first, then come back at the end of the year."
      />
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">End-of-year promotion</CardTitle>
              <CardDescription>
                Pick a class, review the suggested moves, adjust any student, then run it. Graduating students leave the active roll.
              </CardDescription>
            </div>
            <Select value={selectedClassId} onValueChange={setClassId}>
              <SelectTrigger className="w-56" aria-label="Choose class to promote">
                <SelectValue placeholder="Choose class" />
              </SelectTrigger>
              <SelectContent>
                {activeClasses.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c._count.students} students)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {preview && preview.warnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Review before running
              </div>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {previewLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !preview || effectivePlan.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title={`No active students in ${preview?.className ?? 'this class'}`}
              description="Choose another class, or enrol students first."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Promotion plan for {preview.className}</caption>
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th scope="col" className="px-3 py-2.5 font-medium">Student</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Admission №</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Move</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {effectivePlan.map(p => {
                    const o = { action: p.action, toClassId: p.targetClassId }
                    const meta = ACTION_META[o.action]
                    const Icon = meta.icon
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{p.fullName}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.admissionNumber}</td>
                        <td className="px-3 py-2">
                          <Select value={o.action} onValueChange={v => setOverride(p.id, { action: v as PromotionAction })} disabled={!canWrite}>
                            <SelectTrigger size="sm" className={`w-36 border ${meta.classes}`} aria-label={`Action for ${p.fullName}`}>
                              <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" aria-hidden />{meta.label}</span>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ACTION_META) as PromotionAction[]).map(a => {
                                const m = ACTION_META[a]
                                const I = m.icon
                                return (
                                  <SelectItem key={a} value={a}>
                                    <span className="flex items-center gap-2"><I className="h-3.5 w-3.5" aria-hidden />{m.label}</span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {o.action === 'PROMOTE' ? (
                            <Select
                              value={o.toClassId ?? ''} onValueChange={v => setOverride(p.id, { toClassId: v })}
                              disabled={!canWrite}
                            >
                              <SelectTrigger size="sm" className="w-44" aria-label={`Target class for ${p.fullName}`}>
                                <SelectValue placeholder="Choose class" />
                              </SelectTrigger>
                              <SelectContent>
                                {preview.targetClasses.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{o.action === 'GRADUATE' ? 'Leaves active roll' : 'Repeats this class'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {preview && effectivePlan.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {stats.promote} promote
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {stats.hold} hold back
                </Badge>
                <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  {stats.graduate} graduate
                </Badge>
                {preview.inactiveCount > 0 && (
                  <Badge variant="outline" className="text-muted-foreground">{preview.inactiveCount} already inactive</Badge>
                )}
              </div>
              {canWrite && (
                <Button onClick={() => run.mutate()} disabled={run.isPending}>
                  {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}
                  Run promotion
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
