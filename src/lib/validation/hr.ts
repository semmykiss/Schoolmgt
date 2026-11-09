// Zod schemas for the HR & payroll module (Phase 8) — employees, salary
// structures, payslips and leave requests. Amounts are integer kobo.

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
const periodStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a payroll period (YYYY-MM)')
const emptyish = z.literal('').optional()
const moneyLine = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60),
  amount: z.number().int('Whole kobo only').min(0, 'Amount cannot be negative'),
})

// ── Employees ───────────────────────────────────────────────────────────────
export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  gender: z.enum(['MALE', 'FEMALE']).optional().or(emptyish),
  dateOfBirth: dateStr.optional().or(emptyish),
  email: z.string().email('Enter a valid email').optional().or(emptyish),
  phone: z.string().max(30).optional().or(emptyish),
  position: z.string().trim().min(2, 'Position is required').max(60),
  department: z.string().trim().max(60).optional().or(emptyish),
  qualification: z.string().trim().max(120).optional().or(emptyish),
  employmentDate: dateStr,
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'LEFT']).default('ACTIVE'),
})
export const employeeUpdateSchema = employeeCreateSchema.partial()

// ── Salary structures ───────────────────────────────────────────────────────
export const salaryStructureCreateSchema = z.object({
  employeeId: z.string().min(1, 'Pick an employee'),
  name: z.string().trim().min(2, 'Name is required').max(80),
  basicAmount: z.number().int('Whole kobo only').min(0, 'Basic salary cannot be negative'),
  allowances: z.array(moneyLine).max(15, 'Too many allowance lines').default([]),
  deductions: z.array(moneyLine).max(15, 'Too many deduction lines').default([]),
  effectiveFrom: dateStr,
  isActive: z.boolean().default(true),
})
export const salaryStructureUpdateSchema = salaryStructureCreateSchema.partial().omit({ employeeId: true })

// ── Payslips ────────────────────────────────────────────────────────────────
export const payslipGenerateSchema = z.object({ period: periodStr })

// ── Leave requests ──────────────────────────────────────────────────────────
export const leaveRequestCreateSchema = z.object({
  employeeId: z.string().optional(), // omitted → own employee record (self-service)
  type: z.enum(['ANNUAL', 'SICK', 'MATERNITY', 'UNPAID', 'OTHER']),
  startDate: dateStr,
  endDate: dateStr,
  reason: z.string().trim().max(500).optional().or(emptyish),
}).refine(v => v.endDate >= v.startDate, {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
})

export const leaveDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional().or(emptyish),
})

// ── Staff portal access ─────────────────────────────────────────────────────
export const portalAccessSchema = z.object({
  action: z.enum(['CREATE_LOGIN', 'RESET_PASSWORD']),
  role: z.enum(['PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR', 'ADMIN']).default('TEACHER'),
  email: z.string().email('Enter a valid email').optional().or(emptyish),
  password: z.string().min(8, 'Password must be at least 8 characters').max(64).optional().or(emptyish),
})

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>
export type SalaryStructureCreateInput = z.infer<typeof salaryStructureCreateSchema>
export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>
