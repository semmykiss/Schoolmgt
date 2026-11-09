'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ClipboardList, FileSpreadsheet, Grid3x3, ScrollText, Settings2,
} from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExamsTab } from './exams-tab'
import { MarksTab } from './marks-tab'
import { BroadsheetTab } from './broadsheet-tab'
import { ReportCardsTab } from './report-cards-tab'
import { SetupTab } from './setup-tab'

const TAB_ITEMS = [
  { value: 'exams', label: 'Exams', icon: ClipboardList },
  { value: 'marks', label: 'Marks Entry', icon: FileSpreadsheet },
  { value: 'broadsheet', label: 'Broadsheet', icon: Grid3x3 },
  { value: 'report-cards', label: 'Report Cards', icon: ScrollText },
  { value: 'setup', label: 'Setup', icon: Settings2 },
]

export function ExamsView() {
  const canWrite = useSession(s => s.can('exams.write'))
  const canSetup = useSession(s => s.can('exams.setup'))
  const canReports = useSession(s => s.can('exams.reportcards.write'))
  const canMark = useSession(s => s.can('exams.marks'))
  const [tab, setTab] = useState('exams')
  // Carry the broadsheet selection over to the report cards tab
  const [reportsSeed, setReportsSeed] = useState<{ examId: string; classId: string } | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Exams & Grades"
        description="Exam timetables, score entry with auto-grading, broadsheets and branded report cards"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Exams sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="exams" className="mt-4">
          <ExamsTab canWrite={canWrite} onGoMarks={() => setTab('marks')} />
        </TabsContent>
        <TabsContent value="marks" className="mt-4">
          <MarksTab canMark={canMark} />
        </TabsContent>
        <TabsContent value="broadsheet" className="mt-4">
          <BroadsheetTab canWrite={canWrite} onGoMarks={() => setTab('marks')} onGoReports={(examId, classId) => { setReportsSeed({ examId, classId }); setTab('report-cards') }} />
        </TabsContent>
        <TabsContent value="report-cards" className="mt-4">
          <ReportCardsTab canWrite={canReports} seed={reportsSeed} />
        </TabsContent>
        <TabsContent value="setup" className="mt-4">
          <SetupTab canWrite={canSetup} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
