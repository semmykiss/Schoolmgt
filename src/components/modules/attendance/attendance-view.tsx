'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardCheck, UserCheck, Users } from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarkTab } from './mark-tab'
import { SummaryTab } from './summary-tab'
import { StaffTab } from './staff-tab'

const TAB_ITEMS = [
  { value: 'mark', label: 'Mark Register', icon: ClipboardCheck },
  { value: 'summary', label: 'Monthly Summary', icon: Users },
  { value: 'staff', label: 'Staff Attendance', icon: UserCheck },
]

export function AttendanceView() {
  const canWrite = useSession(s => s.can('attendance.write'))
  const canStaff = useSession(s => s.can('attendance.staff.write'))
  const [tab, setTab] = useState('mark')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Attendance"
        description="Daily and per-period registers, monthly analytics and staff attendance"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Attendance sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="mark" className="mt-4">
          <MarkTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <SummaryTab />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <StaffTab canWrite={canStaff} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
