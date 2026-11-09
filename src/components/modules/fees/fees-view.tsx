'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutList, ReceiptText, ToggleLeft, Wallet } from 'lucide-react'
import { useSession } from '@/stores/session'
import { PageHeader } from '@/components/shared/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FeesOverviewTab } from './overview-tab'
import { InvoicesTab } from './invoices-tab'
import { StructuresTab } from './structures-tab'
import { DiscountsTab } from './discounts-tab'

const TAB_ITEMS = [
  { value: 'overview', label: 'Overview', icon: LayoutList },
  { value: 'invoices', label: 'Invoices', icon: ReceiptText },
  { value: 'structures', label: 'Fee Structures', icon: Wallet },
  { value: 'discounts', label: 'Discounts', icon: ToggleLeft },
]

export function FeesView() {
  const canInvoices = useSession(s => s.can('fees.invoices.write'))
  const canStructures = useSession(s => s.can('fees.structures.write'))
  const canDiscounts = useSession(s => s.can('fees.discounts.write'))
  const canPay = useSession(s => s.can('fees.payments.write'))
  const [tab, setTab] = useState('overview')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        title="Fees & Billing"
        description="Fee structures, invoices, payments and collections"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
          <TabsList aria-label="Fees sections">
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
          <FeesOverviewTab onOpenInvoices={() => setTab('invoices')} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab canWrite={canInvoices} canPay={canPay} />
        </TabsContent>
        <TabsContent value="structures" className="mt-4">
          <StructuresTab canWrite={canStructures} />
        </TabsContent>
        <TabsContent value="discounts" className="mt-4">
          <DiscountsTab canWrite={canDiscounts} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
