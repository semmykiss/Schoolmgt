// Inventory & library domain logic — pure functions, no db imports
// (unit-test ready). Phase 9.

// ── Stock movements ─────────────────────────────────────────────────────────

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  IN: 'Stock in',
  OUT: 'Issued out',
  ADJUST: 'Stock adjust',
}

export const ITEM_UNITS = ['pcs', 'packs', 'cartons', 'reams', 'dozens', 'litres', 'kg'] as const

export const ITEM_CATEGORY_SUGGESTIONS = [
  'Stationery', 'Uniform', 'Cleaning', 'Sports', 'Foodstuff', 'Laboratory', 'Maintenance', 'ICT',
]

export const MOVEMENT_REASON_SUGGESTIONS: Record<MovementType, string[]> = {
  IN: ['Purchase', 'Donation', 'Return from class', 'Transfer in'],
  OUT: ['Issued to class', 'Issued to staff', 'Damaged', 'Transfer out', 'Sold'],
  ADJUST: ['Stock count', 'Correction', 'Spoilage write-off'],
}

/**
 * Resulting stock level for a movement.
 *   IN     → current + quantity
 *   OUT    → current − quantity (caller must ensure sufficient stock)
 *   ADJUST → quantity is the NEW counted level (stock-take)
 */
export function stockAfter(type: MovementType, quantity: number, current: number): number {
  if (type === 'IN') return current + quantity
  if (type === 'OUT') return current - quantity
  return quantity
}

/** Human-readable reason a movement is invalid, or null when it is fine. */
export function movementError(type: MovementType, quantity: number, current: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 0) return 'Quantity must be a whole number of 0 or more'
  if (type === 'OUT' && quantity > current) {
    return `Cannot issue ${quantity} — only ${current} in stock`
  }
  if (type === 'ADJUST' && quantity < 0) return 'Counted stock cannot be negative'
  return null
}

export function isLowStock(stockQty: number, reorderLevel: number): boolean {
  return stockQty <= reorderLevel
}

/** Total value of stock in kobo (null unit price items are skipped). */
export function stockValue(items: { stockQty: number; unitPrice: number | null }[]): number {
  return items.reduce((t, i) => t + (i.unitPrice ? i.stockQty * i.unitPrice : 0), 0)
}

// ── Library ─────────────────────────────────────────────────────────────────

/** Library fine per overdue day, in kobo (₦50/day — typical Lagos private school). */
export const LIBRARY_FINE_PER_DAY = 5_000

/** Never charge more than the value of the book. */
export const LIBRARY_FINE_CAP_KOBO = 500_000 // ₦5,000

export const BOOK_CATEGORY_SUGGESTIONS = [
  'Textbook', 'Literature', 'Reference', 'Companion', 'Past Papers', 'General', 'Dictionary',
]

export const LOAN_STATUSES = ['ISSUED', 'RETURNED', 'OVERDUE'] as const

/** Whole days past the due date (0 when on time or already returned in time). */
export function overdueDays(dueDate: string, onDate: string): number {
  if (onDate <= dueDate) return 0
  const a = new Date(`${dueDate}T00:00:00`).getTime()
  const b = new Date(`${onDate}T00:00:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.floor((b - a) / 86_400_000)
}

/** Fine in kobo for returning on `onDate` (YYYY-MM-DD); 0 when on time. */
export function computeFine(dueDate: string, onDate: string, perDay = LIBRARY_FINE_PER_DAY): number {
  const days = overdueDays(dueDate, onDate)
  if (days <= 0) return 0
  return Math.min(days * perDay, LIBRARY_FINE_CAP_KOBO)
}

/** Effective status of a loan row on `today` (ISSUED rows past due are OVERDUE). */
export function effectiveLoanStatus(
  loan: { status: string; dueDate: string },
  today: string,
): string {
  if (loan.status === 'ISSUED' && loan.dueDate < today) return 'OVERDUE'
  return loan.status
}

/** Default due date for a new loan: 14 days from today (YYYY-MM-DD). */
export function defaultLoanDueDate(from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + 14)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
