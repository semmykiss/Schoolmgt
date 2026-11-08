'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Banknote, CalendarDays, FileText, Loader2, Printer, Undo2, User,
} from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { useSession } from '@/stores/session'
import { formatNaira, nairaToKobo } from '@/lib/money'
import { PAYMENT_METHODS } from '@/lib/validation/fees'
import { fmtDate } from '@/components/modules/academics/academic-helpers'
import { parseItems } from '@/lib/domain/fees'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { InvoiceStatusBadge } from './invoice-status-badge'

interface InvoiceDetailData {
  id: string
  invoiceNumber: string
  items: string
  subtotal: number
  discountAmount: number
  total: number
  amountPaid: number
  balance: number
  status: string
  dueDate: string
  notes: string | null
  createdAt: string
  student: {
    firstName: string; lastName: string; admissionNumber: string
    class: { name: string } | null
    section: { name: string } | null
    guardians: { id: string; fullName: string; phone: string | null; relationship: string }[]
  }
  term: { name: string } | null
  payments: {
    id: string; receiptNumber: string; amount: number; method: string
    reference: string | null; paidAt: string; note: string | null
  }[]
  discounts: { id: string; name: string; type: string; value: number }[]
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', TRANSFER: 'Transfer', POS: 'POS', CHEQUE: 'Cheque', ONLINE: 'Online',
}

export function InvoiceDetail({ invoiceId, onClose, onChanged, canWrite }: {
  invoiceId: string | null
  onClose: () => void
  onChanged: () => void
  canWrite: boolean
}) {
  const qc = useQueryClient()
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('CASH')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payRef, setPayRef] = useState('')
  const [payError, setPayError] = useState('')
  const [reverseTarget, setReverseTarget] = useState<string | null>(null)

  const { data: invoice, isLoading } = useQuery({
    queryKey: qk.invoice(invoiceId ?? 'none'),
    queryFn: () => api<InvoiceDetailData>(`/fees/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  })

  const recordPayment = useMutation({
    mutationFn: () => {
      const amount = nairaToKobo(Number(payAmount.replace(/,/g, '')))
      return api(`/fees/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: { amount, method: payMethod, paidAt: payDate, reference: payRef },
      })
    },
    onSuccess: () => {
      toast.success('Payment recorded — receipt generated')
      setPayAmount(''); setPayRef(''); setPayError('')
      onChanged()
      void qc.invalidateQueries({ queryKey: qk.invoice(invoiceId ?? 'none') })
    },
    onError: e => setPayError(e.message),
  })

  const reversePayment = useMutation({
    mutationFn: (paymentId: string) => api(`/fees/invoices/${invoiceId}/payments/${paymentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Payment reversed')
      setReverseTarget(null)
      onChanged()
      void qc.invalidateQueries({ queryKey: qk.invoice(invoiceId ?? 'none') })
    },
    onError: e => toast.error(e.message),
  })

  const lineItems = parseItems(invoice?.items)
  const canPay = canWrite && invoice && invoice.status !== 'VOID' && invoice.balance > 0

  return (
    <Sheet open={!!invoiceId} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg sm:rounded-l-2xl p-0">
        {isLoading || !invoice ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header */}
            <SheetHeader className="space-y-1 border-b p-6 text-left">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-lg tabular-nums">{invoice.invoiceNumber}</SheetTitle>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <SheetDescription>
                {invoice.student.firstName} {invoice.student.lastName} · {invoice.student.admissionNumber}
                {invoice.student.class?.name ? ` · ${invoice.student.class.name}` : ''}
                {invoice.student.section?.name ? ` ${invoice.student.section.name}` : ''}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-6">
              {/* Totals */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatNaira(invoice.total)}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatNaira(invoice.amountPaid)}</p>
                </div>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-destructive">{formatNaira(invoice.balance)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> Due {fmtDate(invoice.dueDate)}</span>
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" aria-hidden /> {invoice.term?.name ?? '—'}</span>
                {invoice.discounts.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {invoice.discounts.map(d => d.name).join(', ')}
                  </span>
                )}
              </div>

              {/* Line items */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Line items</h3>
                <ul className="divide-y rounded-lg border">
                  {lineItems.map((item, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="tabular-nums">{formatNaira(item.amount)}</span>
                    </li>
                  ))}
                  {invoice.discountAmount > 0 && (
                    <li className="flex items-center justify-between px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                      <span>Discount</span>
                      <span className="tabular-nums">−{formatNaira(invoice.discountAmount)}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Payments */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Payments ({invoice.payments.length})</h3>
                {invoice.payments.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    No payments yet
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {invoice.payments.map(p => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium tabular-nums">{formatNaira(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {METHOD_LABEL[p.method] ?? p.method} · {fmtDate(p.paidAt)} · {p.receiptNumber}
                          </p>
                        </div>
                        {canWrite && (
                          <Button
                            variant="ghost" size="icon" aria-label={`Reverse receipt ${p.receiptNumber}`}
                            onClick={() => setReverseTarget(p.id)}
                          >
                            <Undo2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Record payment */}
              {canPay && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Banknote className="h-4 w-4" aria-hidden /> Record payment
                    </h3>
                    <form
                      className="space-y-3"
                      onSubmit={e => {
                        e.preventDefault()
                        const amount = Number(payAmount.replace(/,/g, ''))
                        if (!Number.isFinite(amount) || amount <= 0) { setPayError('Enter a valid amount'); return }
                        if (nairaToKobo(amount) > invoice.balance) {
                          setPayError(`Amount exceeds the outstanding balance of ${formatNaira(invoice.balance)}`)
                          return
                        }
                        setPayError('')
                        recordPayment.mutate()
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="pay-amount">Amount (₦)</Label>
                          <Input
                            id="pay-amount" inputMode="decimal" placeholder="0"
                            value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="pay-method">Method</Label>
                          <Select value={payMethod} onValueChange={setPayMethod}>
                            <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{METHOD_LABEL[m] ?? m}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="pay-date">Date</Label>
                          <Input id="pay-date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="pay-ref">Reference</Label>
                          <Input id="pay-ref" placeholder="Optional" value={payRef} onChange={e => setPayRef(e.target.value)} />
                        </div>
                      </div>
                      {payError && <p className="text-sm text-destructive">{payError}</p>}
                      <div className="flex gap-2">
                        <Button
                          type="button" variant="outline" size="sm" className="flex-1"
                          onClick={() => setPayAmount(String(invoice.balance / 100))}
                        >
                          Pay full balance
                        </Button>
                        <Button type="submit" size="sm" className="flex-1" disabled={recordPayment.isPending}>
                          {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                          Record
                        </Button>
                      </div>
                    </form>
                  </div>
                </>
              )}

              {invoice.status !== 'VOID' && (
                <Button variant="outline" className="w-full" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-4 w-4" aria-hidden /> Print / Save PDF
                </Button>
              )}

              {invoice.notes && (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Notes: </span>{invoice.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={!!reverseTarget}
        onOpenChange={o => { if (!o) setReverseTarget(null) }}
        title="Reverse this payment?"
        description="The receipt is deleted, the invoice balance is restored and the linked ledger income is removed."
        confirmLabel="Reverse payment"
        destructive
        onConfirm={async () => { if (reverseTarget) await reversePayment.mutateAsync(reverseTarget) }}
      />
    </Sheet>
  )
}
