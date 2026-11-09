'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, Check, HelpCircle, type LucideIcon } from 'lucide-react'
import { MODULES, PHASE_CONTENT } from '@/lib/nav'
import { navigate } from '@/hooks/use-hash-route'
import { Button } from '@/components/ui/button'

export function ComingSoon({ itemKey }: { itemKey: string }) {
  const item = MODULES[itemKey]
  const Icon: LucideIcon = item?.icon ?? HelpCircle
  const phase = item?.phase ?? 0
  const content = PHASE_CONTENT[phase]

  if (!item) {
    // Graceful fallback for unknown module keys
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex justify-center py-10"
      >
        <div className="w-full max-w-lg rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <HelpCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold">This module is on the roadmap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn&apos;t find “{itemKey}” — it may be part of a later phase of SchoolDesk.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => navigate('/dashboard')}>
            <ArrowLeft aria-hidden /> Back to dashboard
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex justify-center py-10"
    >
      <div className="w-full max-w-2xl rounded-xl border border-dashed bg-card px-6 py-12 text-center sm:px-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
          {content?.title ?? item.label} arrives in Phase {phase}
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          We&apos;re building SchoolDesk in phases — this module lands in Phase {phase} of 10.
        </p>

        {content && (
          <ul className="mx-auto mt-8 grid max-w-xl gap-2.5 text-left sm:grid-cols-2">
            {content.bullets.map(b => (
              <li key={b} className="flex items-start gap-2 rounded-lg border bg-background/60 p-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" className="mt-8" onClick={() => navigate('/dashboard')}>
          <ArrowLeft aria-hidden /> Back to dashboard
        </Button>
      </div>
    </motion.div>
  )
}
