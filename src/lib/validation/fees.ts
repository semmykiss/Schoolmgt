// Zod schemas for the Fees & Accounts module (structures, invoices, payments,
// discounts, ledger entries).

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')

export const INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'] as const
export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'POS', 'CHEQUE', 'ONLINE'] as const
export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const
export const LEDGER_TYPES = ['INCOME', 'EXPENSE'] as const
export const LEDGER_CATEGORIES = [
  'TUITION', 'OTHER_INCOME', 'SALARIES', 'UTILITIES', 'MAINTENANCE',
  'SUPPLIES', 'TRANSPORT', 'EVENTS', 'TAXES', 'OTHER',
] as const

// ── Fee structures ──────────────────────────────────────────────────────────
/** Line items are stored as JSON: [{label, amount(kobo)}] — amounts validated as naira input client-side. */
export const feeItemSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(120),
  amount: z.number().int('Amount must be a whole number of kobo').min(0).max(999_999_999_99),
})

export const feeStructureCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  classId: z.string().min(1, 'Select the class'),
  termId: z.string().min(1, 'Select the term'),
  sessionId: z.string().min(1, 'Select the session'),
  items: z.array(feeItemSchema).min(1, 'Add at least one fee item'),
  isActive: z.boolean().default(true),
})

export const feeStructureUpdateSchema = feeStructureCreateSchema.partial()

// ── Invoices ────────────────────────────────────────────────────────────────
export const invoiceCreateSchema = z.object({
  studentId: z.string().min(1, 'Select the student'),
  termId: z.string().min(1, 'Select the term'),
  sessionId: z.string().min(1, 'Select the session'),
  feeStructureId: z.string().optional().nullable(),
  items: z.array(feeItemSchema).min(1, 'Add at least one line item'),
  discountAmount: z.number().int().min(0).default(0),
  dueDate: dateStr,
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

export const invoiceUpdateSchema = z.object({
  items: z.array(feeItemSchema).min(1).optional(),
  discountAmount: z.number().int().min(0).optional(),
  dueDate: dateStr.optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  status: z.enum(INVOICE_STATUSES).optional(),
})

export const invoiceBulkSchema = z.object({
  feeStructureId: z.string().min(1, 'Select the fee structure'),
  classId: z.string().min(1, 'Select the class'),
  sectionId: z.string().optional().nullable(),
  dueDate: dateStr,
  /** Skip students who already have an unpaid/partial/paid invoice for this term. */
  skipExisting: z.boolean().default(true),
})

// ── Payments ────────────────────────────────────────────────────────────────
export const paymentCreateSchema = z.object({
  amount: z.number().int('Amount must be whole kobo').min(1, 'Enter the amount paid').max(999_999_999_99),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  paidAt: dateStr,
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

// ── Discounts ───────────────────────────────────────────────────────────────
export const discountBaseSchema = z.object({
  studentId: z.string().min(1, 'Select the student'),
  name: z.string().trim().min(2, 'Name is required').max(120),
  type: z.enum(DISCOUNT_TYPES),
  /** PERCENT → 1-100 (whole), FIXED → kobo */
  value: z.number().int().min(1, 'Value must be at least 1'),
  sessionId: z.string().optional().nullable(),
  active: z.boolean().default(true),
})

export const discountCreateSchema = discountBaseSchema.refine(
  d => d.type !== 'PERCENT' || d.value <= 100,
  { message: 'Percentage cannot exceed 100', path: ['value'] },
)

export const discountUpdateSchema = discountBaseSchema.partial()

// ── Ledger ──────────────────────────────────────────────────────────────────
export const ledgerEntryCreateSchema = z.object({
  type: z.enum(LEDGER_TYPES),
  category: z.enum(LEDGER_CATEGORIES),
  description: z.string().trim().min(2, 'Description is required').max(300),
  amount: z.number().int('Amount must be whole kobo').min(1, 'Enter the amount').max(999_999_999_99),
  date: dateStr,
})

export const ledgerEntryUpdateSchema = ledgerEntryCreateSchema.partial()
