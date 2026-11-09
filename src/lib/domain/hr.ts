// HR & payroll domain logic — pure functions, no db imports (unit-test ready).

import { randomBytes } from 'crypto'

export interface SalaryLine {
  label: string
  amount: number // kobo
}

export interface PayslipItem {
  label: string
  amount: number // kobo
  type: 'BASIC' | 'ALLOWANCE' | 'DEDUCTION'
}

export interface PayslipComputation {
  gross: number
  totalDeductions: number
  net: number
  items: PayslipItem[]
}

/** Build the payslip breakdown (basic + allowances − deductions) from a salary structure. */
export function computePayslip(s: {
  basicAmount: number
  allowances?: SalaryLine[] | null
  deductions?: SalaryLine[] | null
}): PayslipComputation {
  const allowances = (s.allowances ?? []).filter(l => l.amount > 0)
  const deductions = (s.deductions ?? []).filter(l => l.amount > 0)
  const items: PayslipItem[] = [
    { label: 'Basic Salary', amount: s.basicAmount, type: 'BASIC' },
    ...allowances.map(l => ({ label: l.label, amount: l.amount, type: 'ALLOWANCE' as const })),
    ...deductions.map(l => ({ label: l.label, amount: l.amount, type: 'DEDUCTION' as const })),
  ]
  const gross = s.basicAmount + allowances.reduce((t, l) => t + l.amount, 0)
  const totalDeductions = deductions.reduce((t, l) => t + l.amount, 0)
  return { gross, totalDeductions, net: gross - totalDeductions, items }
}

/** Safely parse the JSON salary lines stored on SalaryStructure rows. */
export function parseSalaryLines(json: string | null | undefined): SalaryLine[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(l => l && typeof l.label === 'string' && Number.isFinite(l.amount)) : []
  } catch {
    return []
  }
}

/** "YYYY-MM" for a date (defaults to now). */
export function periodOf(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Shift a "YYYY-MM" period by n months (negative allowed). */
export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  return periodOf(new Date(y, m - 1 + delta, 1))
}

/** Pretty label for a "YYYY-MM" period, e.g. "January 2025". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-NG', { month: 'long', year: 'numeric' })
}

/** Inclusive day count of a YYYY-MM-DD range. */
export function leaveDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Whether two inclusive YYYY-MM-DD ranges overlap. */
export function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'UNPAID', 'OTHER'] as const

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Annual leave',
  SICK: 'Sick leave',
  MATERNITY: 'Maternity leave',
  UNPAID: 'Unpaid leave',
  OTHER: 'Other',
}

/** Roles that may be granted to an employee portal login (never PARENT/STUDENT). */
export const STAFF_LOGIN_ROLES = ['PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR', 'ADMIN'] as const

/** Readable one-time password for new/reset staff logins, e.g. "Sd-4f9a2c1b8e-x7". */
export function generateTempPassword(): string {
  return `Sd-${randomBytes(5).toString('hex')}-x7`
}
