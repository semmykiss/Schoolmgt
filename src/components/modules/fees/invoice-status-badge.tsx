'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  UNPAID: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20',
  OVERDUE: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  VOID: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20 line-through',
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE[status] ?? '')}>
      {status}
    </Badge>
  )
}
