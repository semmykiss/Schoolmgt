'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, NotebookText } from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LedgerTab } from './ledger-tab'
import { AccountsAnalyticsTab } from './analytics-tab'

const TAB_ITEMS = [
  { value: 'ledger', label: 'Ledger', icon: NotebookText },
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
]

export function AccountsView() {
  const canWrite = useSession(s => s.can('accounts.write'))
  const [tab, setTab] = useState('ledger')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Accounts & Ledger"
        description="Income and expense records with monthly analytics"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Accounts sections">
            {TAB_ITEMS.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="ledger" className="mt-4">
          <LedgerTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AccountsAnalyticsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
