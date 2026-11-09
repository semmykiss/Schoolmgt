// Zod schemas for the Attendance module (student register, staff register).

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')

export const STUDENT_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const
export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'ON_LEAVE'] as const

// ── Student attendance ──────────────────────────────────────────────────────
/** Save the whole register for one class+section+date (+ optional period) at once. */
export const attendanceSaveSchema = z.object({
  date: dateStr,
  classId: z.string().min(1, 'Select the class'),
  sectionId: z.string().optional().nullable(),
  periodId: z.string().optional().nullable(), // null = whole-day register
  records: z.array(z.object({
    studentId: z.string().min(1),
    status: z.enum(STUDENT_ATTENDANCE_STATUSES),
    remarks: z.string().trim().max(300).optional().or(z.literal('')),
  })).min(1, 'The register is empty'),
})

// ── Staff attendance ────────────────────────────────────────────────────────
export const staffAttendanceSaveSchema = z.object({
  date: dateStr,
  records: z.array(z.object({
    employeeId: z.string().min(1),
    status: z.enum(STAFF_ATTENDANCE_STATUSES),
    checkIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Check-in must be HH:MM').optional().or(z.literal('')),
    checkOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Check-out must be HH:MM').optional().or(z.literal('')),
    remarks: z.string().trim().max(300).optional().or(z.literal('')),
  })).min(1, 'There are no staff to mark'),
})
