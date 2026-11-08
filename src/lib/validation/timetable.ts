// Zod schemas for the Timetable module (periods + timetable slots).

import { z } from 'zod'

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)')

/** 0=Monday … 4=Friday, 5=Saturday (Sunday never runs school) */
export const WEEK_DAYS = [0, 1, 2, 3, 4, 5] as const
export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Periods ─────────────────────────────────────────────────────────────────
export const periodCreateSchema = z.object({
  name: z.string().trim().min(2, 'Period name is required, e.g. Period 1 or Break').max(40),
  startTime: timeStr,
  endTime: timeStr,
  order: z.coerce.number().int('Order must be a whole number').min(1).max(30),
  isBreak: z.boolean().default(false),
}).refine(v => v.endTime > v.startTime, {
  message: 'End time must be after the start time', path: ['endTime'],
})

export const periodUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  order: z.coerce.number().int().min(1).max(30).optional(),
  isBreak: z.boolean().optional(),
}).refine(v => !v.startTime || !v.endTime || v.endTime > v.startTime, {
  message: 'End time must be after the start time', path: ['endTime'],
})

// ── Timetable slots ─────────────────────────────────────────────────────────
export const slotCreateSchema = z.object({
  termId: z.string().min(1, 'Select the term'),
  classId: z.string().min(1, 'Select the class'),
  sectionId: z.string().optional().nullable(),
  day: z.coerce.number().int().min(0, 'Day is Monday–Saturday').max(5),
  periodId: z.string().min(1, 'Select the period'),
  classSubjectId: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
})

export const slotUpdateSchema = z.object({
  classId: z.string().min(1).optional(),
  sectionId: z.string().optional().nullable(),
  day: z.coerce.number().int().min(0).max(5).optional(),
  periodId: z.string().min(1).optional(),
  classSubjectId: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
})

/** Copy every non-empty slot of one class+section into another class+section. */
export const timetableCopySchema = z.object({
  termId: z.string().min(1, 'Select the term'),
  fromClassId: z.string().min(1, 'Select the source class'),
  fromSectionId: z.string().optional().nullable(),
  toClassId: z.string().min(1, 'Select the target class'),
  toSectionId: z.string().optional().nullable(),
}).refine(v => !(v.fromClassId === v.toClassId && (v.fromSectionId ?? null) === (v.toSectionId ?? null)), {
  message: 'Source and target must be different', path: ['toClassId'],
})
