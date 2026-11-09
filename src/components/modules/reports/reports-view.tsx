'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BarChart3, BookmarkPlus, ClipboardCheck, GraduationCap, LayoutDashboard,
  Settings2, Users, Wallet,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { OverviewTab } from './tab-overview'
import { EnrollmentTab } from './tab-enrollment'
import { AcademicTab } from './tab-academic'
import { FinancialTab } from './tab-financial'
import { AttendanceTab } from './tab-attendance'
import { AutomationTab, type SavedFilterRow } from './tab-automation'

export interface ReportFilters {
  examId: string
  termId: string
  classId: string
  from: string
  to: string
}

const isoToday = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export const DEFAULT_FILTERS: ReportFilters = {
  examId: '', termId: '', classId: '', from: daysAgo(29), to: isoToday(),
}

const TAB_VALUES = ['overview', 'enrollment', 'academic', 'financial', 'attendance', 'automation'] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_ITEMS: { value: TabValue; label: string; icon: typeof LayoutDashboard }[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'enrollment', label: 'Enrollment', icon: Users },
  { value: 'academic', label: 'Academic', icon: GraduationCap },
  { value: 'financial', label: 'Financial', icon: Wallet },
  { value: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { value: 'automation', label: 'Saved & Scheduled', icon: Settings2 },
]

/** Criteria snapshot for the current tab — stored on saved views. */
function snapshotCriteria(tab: TabValue, f: ReportFilters): Record<string, unknown> {
  const criteria: Record<string, unknown> = { tab }
  if (tab === 'academic' && f.examId) criteria.examId = f.examId
  if (tab === 'financial' && f.termId) criteria.termId = f.termId
  if (tab === 'attendance') {
    if (f.classId) criteria.classId = f.classId
    criteria.from = f.from
    criteria.to = f.to
  }
  return criteria
}

export function ReportsView() {
  const canWrite = useSession(s => s.can('reports.write'))
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabValue>('overview')
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')

  const saveView = useMutation({
    mutationFn: (name: string) =>
      api('/reports/saved-filters', {
        method: 'POST',
        body: { module: 'reports', name, criteria: snapshotCriteria(tab, filters) },
      }),
    onSuccess: () => {
      toast.success('View saved — find it under Saved & Scheduled')
      setSaveOpen(false)
      setViewName('')
      void queryClient.invalidateQueries({ queryKey: qk.savedFilters() })
    },
    onError: err => toast.error(err instanceof Error ? err.message : 'Could not save view'),
  })

  const applyView = (view: SavedFilterRow) => {
    const c = view.criteria ?? {}
    setFilters({
      examId: typeof c.examId === 'string' ? c.examId : '',
      termId: typeof c.termId === 'string' ? c.termId : '',
      classId: typeof c.classId === 'string' ? c.classId : '',
      from: typeof c.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.from) ? c.from : DEFAULT_FILTERS.from,
      to: typeof c.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.to) ? c.to : DEFAULT_FILTERS.to,
    })
    const target = TAB_VALUES.includes(c.tab as TabValue) ? (c.tab as TabValue) : 'overview'
    setTab(target)
    toast.success(`Applied view "${view.name}"`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Reports & Analytics"
        description="School-wide insights across enrollment, academics, finance and attendance"
        actions={
          canWrite ? (
            <Button variant="outline" onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden />
              Save current view
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={v => setTab(v as TabValue)}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Report sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="enrollment" className="mt-4">
          <EnrollmentTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="academic" className="mt-4">
          <AcademicTab filters={filters} onFilterChange={patch => setFilters(f => ({ ...f, ...patch }))} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="financial" className="mt-4">
          <FinancialTab filters={filters} onFilterChange={patch => setFilters(f => ({ ...f, ...patch }))} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab filters={filters} onFilterChange={patch => setFilters(f => ({ ...f, ...patch }))} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="automation" className="mt-4">
          <AutomationTab onApply={applyView} />
        </TabsContent>
      </Tabs>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Stores the {tab} tab with its active filters so you can re-apply it in one click.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!viewName.trim()) return
              saveView.mutate(viewName.trim())
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                placeholder={`e.g. ${tab} — my default`}
                maxLength={80}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveView.isPending || !viewName.trim()}>
                {saveView.isPending ? 'Saving…' : 'Save view'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
