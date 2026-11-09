// Pure fee/accounting logic — no db imports. Unit-testable rules used by the
// invoice/payment endpoints and UI.

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'

export interface FeeItemLike { label: string; amount: number }

/** Sum of line items (kobo). */
export function subtotalOf(items: FeeItemLike[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, Math.round(i.amount)), 0)
}

/** Total after discount, floored at 0. */
export function totalOf(items: FeeItemLike[], discountAmount = 0): number {
  return Math.max(0, subtotalOf(items) - Math.max(0, discountAmount))
}

/** Outstanding balance (kobo) — never negative. */
export function balanceOf(total: number, amountPaid: number): number {
  return Math.max(0, total - Math.max(0, amountPaid))
}

/**
 * Status transition rules (paid amounts updated after payment):
 *  - VOID is sticky — only a manual override can change it.
 *  - paid ≥ total → PAID
 *  - paid > 0 → PARTIAL
 *  - paid = 0 && dueDate passed → OVERDUE
 *  - else UNPAID
 */
export function computeStatus(args: {
  total: number
  amountPaid: number
  dueDate: string        // YYYY-MM-DD
  today: string          // YYYY-MM-DD (caller injects for testability)
  current?: InvoiceStatus
}): InvoiceStatus {
  if (args.current === 'VOID') return 'VOID'
  if (args.amountPaid >= args.total && args.total > 0) return 'PAID'
  if (args.amountPaid > 0) return 'PARTIAL'
  if (args.dueDate && args.today > args.dueDate) return 'OVERDUE'
  return 'UNPAID'
}

/** Apply a Discount definition to a subtotal. */
export function applyDiscount(
  subtotal: number,
  discount: { type: 'PERCENT' | 'FIXED'; value: number; active?: boolean },
): number {
  if (discount.active === false) return 0
  if (discount.type === 'PERCENT') {
    return Math.round((subtotal * Math.min(100, Math.max(0, discount.value))) / 100)
  }
  return Math.min(subtotal, Math.max(0, discount.value))
}

/** Render a line-items JSON column safely. */
export function parseItems(json: string | null | undefined): FeeItemLike[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter(i => i && typeof i.label === 'string' && Number.isFinite(i.amount))
      : []
  } catch {
    return []
  }
}

/** Allocation of a payment across instalments — oldest unpaid first. */
export function allocateToInstalments(
  instalments: { id: string; amount: number; paidAmount: number }[],
  payment: number,
): { id: string; add: number }[] {
  let remaining = payment
  const alloc: { id: string; add: number }[] = []
  for (const inst of instalments) {
    if (remaining <= 0) break
    const need = inst.amount - inst.paidAmount
    if (need <= 0) continue
    const add = Math.min(need, remaining)
    alloc.push({ id: inst.id, add })
    remaining -= add
  }
  return alloc
}
