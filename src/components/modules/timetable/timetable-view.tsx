'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Grid3X3, UserSquare2 } from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeriodsTab } from './periods-tab'
import { ClassGridTab } from './class-grid-tab'
import { TeacherGridTab } from './teacher-grid-tab'

const TAB_ITEMS = [
  { value: 'class', label: 'Class Timetable', icon: Grid3X3 },
  { value: 'teacher', label: 'Teacher Timetable', icon: UserSquare2 },
  { value: 'periods', label: 'Periods', icon: CalendarClock },
]

export function TimetableView() {
  const canWrite = useSession(s => s.can('timetable.write'))
  const [tab, setTab] = useState('class')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Timetable"
        description="Periods, class grids and teacher schedules — clash-checked as you edit"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Timetable sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="class" className="mt-4">
          <ClassGridTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="teacher" className="mt-4">
          <TeacherGridTab />
        </TabsContent>
        <TabsContent value="periods" className="mt-4">
          <PeriodsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
