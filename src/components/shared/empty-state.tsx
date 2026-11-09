'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Smaller paddings/type — for use inside cards and panels. */
  compact?: boolean
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
      compact ? 'px-4 py-6' : 'px-6 py-14',
      className,
    )}>
      <div className={cn('flex items-center justify-center rounded-full bg-muted', compact ? 'h-9 w-9' : 'h-12 w-12')}>
        <Icon className={cn('text-muted-foreground', compact ? 'h-4.5 w-4.5' : 'h-6 w-6')} aria-hidden />
      </div>
      <h3 className={cn('font-semibold', compact ? 'mt-2 text-sm' : 'mt-4 text-base')}>{title}</h3>
      {description && <p className={cn('mt-1 max-w-md text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
