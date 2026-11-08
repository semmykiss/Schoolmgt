'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, CalendarRange, GraduationCap, NotebookPen, TrendingUp, Users2 } from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SessionsTermsTab } from './sessions-terms-tab'
import { ClassesTab } from './classes-tab'
import { SubjectsTab } from './subjects-tab'
import { AssignmentTab } from './assignment-tab'
import { LessonPlansTab } from './lesson-plans-tab'
import { PromotionsTab } from './promotions-tab'

const TAB_ITEMS = [
  { value: 'sessions', label: 'Sessions & Terms', icon: CalendarRange },
  { value: 'classes', label: 'Classes & Sections', icon: GraduationCap },
  { value: 'subjects', label: 'Subjects', icon: BookOpen },
  { value: 'assignment', label: 'Teacher Assignment', icon: Users2 },
  { value: 'plans', label: 'Lesson Plans', icon: NotebookPen },
  { value: 'promotions', label: 'Promotions', icon: TrendingUp },
]

export function AcademicSetupView() {
  const canWrite = useSession(s => s.can('academic.write'))
  const [tab, setTab] = useState('sessions')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Academic Setup"
        description="Sessions, classes, subjects and the teachers who deliver them"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Academic setup sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTermsTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="classes" className="mt-4">
          <ClassesTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="assignment" className="mt-4">
          <AssignmentTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <LessonPlansTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="promotions" className="mt-4">
          <PromotionsTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
