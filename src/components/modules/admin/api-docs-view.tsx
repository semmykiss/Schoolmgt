'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Braces, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'

interface OperationDoc {
  summary?: string
  tags?: string[]
}

interface OpenApiDoc {
  openapi?: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, OperationDoc>>
}

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const
type Method = (typeof METHODS)[number]

const METHOD_CLASS: Record<Method, string> = {
  get: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  post: 'bg-primary/10 text-primary',
  patch: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  put: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  delete: 'bg-destructive/10 text-destructive',
}

interface Endpoint {
  path: string
  method: Method
  summary: string
  tag: string
}

export function ApiDocsView() {
  const [needle, setNeedle] = useState('')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['openapi'],
    queryFn: async (): Promise<OpenApiDoc> => {
      const res = await fetch('/api/v1/openapi.json')
      if (!res.ok) throw new Error(`Failed to load the OpenAPI document (${res.status})`)
      return (await res.json()) as OpenApiDoc
    },
    staleTime: 5 * 60_000,
  })

  const endpoints = useMemo<Endpoint[]>(() => {
    const out: Endpoint[] = []
    for (const [path, ops] of Object.entries(data?.paths ?? {})) {
      for (const method of METHODS) {
        const op = ops[method]
        if (!op) continue
        out.push({ path, method, summary: op.summary ?? '', tag: op.tags?.[0] ?? 'Other' })
      }
    }
    return out
  }, [data])

  const groups = useMemo(() => {
    const q = needle.trim().toLowerCase()
    const filtered = endpoints.filter(e =>
      !q || e.path.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q))
    const map = new Map<string, Endpoint[]>()
    for (const e of filtered) {
      const list = map.get(e.tag) ?? []
      list.push(e)
      map.set(e.tag, list)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, items]) => ({
        tag,
        items: [...items].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
      }))
  }, [endpoints, needle])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="API Explorer"
        description="REST endpoints under /api/v1 — OpenAPI 3.1"
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={needle}
              onChange={e => setNeedle(e.target.value)}
              placeholder="Filter endpoints…"
              aria-label="Filter endpoints"
              className="h-9 pl-8"
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          <Braces className="h-3.5 w-3.5" aria-hidden />
          {isLoading ? '…' : endpoints.length} endpoints
        </Badge>
        <Badge variant="outline" className="px-2.5 py-1">Base URL: /api/v1</Badge>
        {data?.openapi && <Badge variant="outline" className="px-2.5 py-1">OpenAPI {data.openapi}</Badge>}
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-xl border p-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Braces}
          title="Could not load the API document"
          description="The OpenAPI document is unavailable right now. Try refreshing the page."
        />
      ) : groups.length === 0 ? (
        <EmptyState icon={Search} title="No endpoints match your search" description="Try a different path or keyword." />
      ) : (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border p-3">
          {groups.map(g => (
            <Collapsible key={g.tag} defaultOpen className="rounded-lg border bg-card">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2">
                  {g.tag}
                  <Badge variant="secondary" className="text-[10px]">{g.items.length}</Badge>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y border-t">
                  {g.items.map(e => (
                    <div key={`${e.method}-${e.path}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                      <span
                        className={cn(
                          'w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold uppercase',
                          METHOD_CLASS[e.method],
                        )}
                      >
                        {e.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">{e.path}</span>
                      <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">{e.summary}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </motion.div>
  )
}
