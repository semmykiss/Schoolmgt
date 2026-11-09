// Zod schemas for the inventory & library module (Phase 9).
// Money is integer kobo; dates are YYYY-MM-DD strings.

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
const emptyish = z.literal('').optional()

// ── Inventory items ─────────────────────────────────────────────────────────
export const itemCreateSchema = z.object({
  name: z.string().trim().min(2, 'Item name is required').max(80),
  sku: z.string().trim().max(30).optional().or(emptyish),
  category: z.string().trim().max(40).optional().or(emptyish),
  unit: z.string().trim().min(1).max(12).default('pcs'),
  reorderLevel: z.number().int('Whole numbers only').min(0, 'Reorder level cannot be negative').default(5),
  unitPrice: z.number().int('Whole kobo only').min(0).nullable().optional(),
  description: z.string().trim().max(300).optional().or(emptyish),
})
export const itemUpdateSchema = itemCreateSchema.partial()

// ── Stock movements ─────────────────────────────────────────────────────────
export const movementCreateSchema = z.object({
  itemId: z.string().min(1, 'Pick an item'),
  type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.number().int('Whole numbers only').min(0, 'Quantity cannot be negative'),
  unitCost: z.number().int('Whole kobo only').min(0).nullable().optional(),
  reason: z.string().trim().max(120).optional().or(emptyish),
  reference: z.string().trim().max(60).optional().or(emptyish),
  supplierId: z.string().optional().or(emptyish),
  date: dateStr,
})

// ── Suppliers ───────────────────────────────────────────────────────────────
export const supplierCreateSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name is required').max(80),
  contactName: z.string().trim().max(80).optional().or(emptyish),
  phone: z.string().trim().max(30).optional().or(emptyish),
  email: z.string().email('Enter a valid email').optional().or(emptyish),
  address: z.string().trim().max(200).optional().or(emptyish),
  notes: z.string().trim().max(300).optional().or(emptyish),
})
export const supplierUpdateSchema = supplierCreateSchema.partial()

// ── Library books ───────────────────────────────────────────────────────────
export const bookCreateSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(160),
  author: z.string().trim().max(120).optional().or(emptyish),
  isbn: z.string().trim().max(20).optional().or(emptyish),
  category: z.string().trim().max(40).optional().or(emptyish),
  shelf: z.string().trim().max(30).optional().or(emptyish),
  totalCopies: z.number().int('Whole numbers only').min(1, 'At least one copy').max(999).default(1),
})
export const bookUpdateSchema = bookCreateSchema.partial()

// ── Book loans ──────────────────────────────────────────────────────────────
export const loanIssueSchema = z.object({
  bookId: z.string().min(1, 'Pick a book'),
  borrowerType: z.enum(['STUDENT', 'EMPLOYEE']),
  borrowerId: z.string().min(1, 'Pick the borrower'),
  dueDate: dateStr,
})

export const loanReturnSchema = z.object({
  fineAmount: z.number().int('Whole kobo only').min(0, 'Fine cannot be negative').nullable().optional(),
})
