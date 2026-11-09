'use client'

// Shared chart kit for the Reports module — consistent colours (teal/amber
// palette, no blue/indigo), tooltip styling and card chrome.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'

export const CHART = {
  teal: '#0F766E',
  amber: '#D97706',
  emerald: '#059669',
  rose: '#E11D48',
  slate: '#64748B',
  stone: '#78716C',
} as const

export const PIE_COLORS = [CHART.teal, CHART.amber, CHART.emerald, CHART.rose, CHART.slate, CHART.stone]

export const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
} as const

export const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 } as const

export const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  GRADUATED: 'bg-muted text-muted-foreground',
  TRANSFERRED: 'bg-muted text-muted-foreground',
  SUSPENDED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  LEFT: 'bg-muted text-muted-foreground',
  APPLIED: 'bg-muted text-muted-foreground',
  INTERVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ADMITTED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  WAITLISTED: 'bg-stone-500/10 text-stone-600 dark:text-stone-400',
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  UNPAID: 'bg-destructive/10 text-destructive',
  PARTIAL: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  OVERDUE: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  VOID: 'bg-muted text-muted-foreground',
  PRESENT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ABSENT: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  LATE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  EXCUSED: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  ON_LEAVE: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  FULL_TIME: 'bg-primary/10 text-primary',
  PART_TIME: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  CONTRACT: 'bg-stone-500/10 text-stone-600 dark:text-stone-400',
}

interface ChartCardProps {
  title: string
  icon: LucideIcon
  action?: ReactNode
  loading?: boolean
  empty?: string | null
  className?: string
  contentClassName?: string
  children: ReactNode
}

/** Card wrapper with consistent header chrome, loading skeleton and empty state. */
export function ChartCard({ title, icon: Icon, action, loading, empty, className, contentClassName, children }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {Icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className={contentClassName}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : empty ? (
          <EmptyState icon={Icon} title={empty} className="border-0 py-8" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

export function pctLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${n}%`
}

export function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ').toLowerCase() : s
}
