// Zod schemas for the Exams & Report Cards module (exam types, exams,
// schedules, grading scales, marks entry, report cards).

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM')

// ── Exam types ──────────────────────────────────────────────────────────────
export const examTypeCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  weight: z.number().int().min(1).max(100).default(100),
})
export const examTypeUpdateSchema = examTypeCreateSchema.partial()

// ── Exams ──────────────────────────────────────────────────────────────
const examBaseSchema = z.object({
  name: z.string().trim().min(3, 'Name is required').max(140),
  termId: z.string().min(1, 'Select the term'),
  examTypeId: z.string().min(1, 'Select the exam type'),
  startDate: dateStr.optional().or(z.literal('')),
  endDate: dateStr.optional().or(z.literal('')),
})
export const examCreateSchema = examBaseSchema.refine(
  v => !v.startDate || !v.endDate || v.startDate <= v.endDate,
  { message: 'End date cannot be before the start date', path: ['endDate'] },
)
// Zod 4 forbids .partial() on refined schemas — derive the update shape from the base
export const examUpdateSchema = examBaseSchema.partial()

export const examPublishSchema = z.object({
  publishResults: z.boolean().optional(),
  publishClassScores: z.boolean().optional(),
}).refine(v => v.publishResults !== undefined || v.publishClassScores !== undefined, {
  message: 'Nothing to publish',
})

// ── Schedules ─────────────────────────────────────────────────────────────
const scheduleBaseSchema = z.object({
  examId: z.string().min(1, 'Select the exam'),
  classSubjectId: z.string().min(1, 'Select the class subject'),
  date: dateStr,
  startTime: timeStr,
  endTime: timeStr,
  maxMarks: z.number().int().min(1).max(1000).default(100),
  passMarks: z.number().int().min(0).default(40),
})
export const scheduleCreateSchema = scheduleBaseSchema.refine(
  v => v.startTime < v.endTime,
  { message: 'End time must be after the start time', path: ['endTime'] },
)
export const scheduleUpdateSchema = scheduleBaseSchema.partial()

// ── Grading scales (bands nested) ───────────────────────────────────────────
export const gradeBandSchema = z.object({
  grade: z.string().trim().min(1, 'Grade is required').max(8),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(0).max(100),
  remark: z.string().trim().min(1, 'Remark is required').max(40),
  points: z.number().int().min(1).max(10).optional().nullable(),
}).refine(v => v.minScore <= v.maxScore, {
  message: 'Band minimum cannot exceed its maximum',
  path: ['maxScore'],
})

export const gradingScaleCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  isDefault: z.boolean().default(false),
  bands: z.array(gradeBandSchema).min(1, 'Add at least one grade band'),
})
export const gradingScaleUpdateSchema = gradingScaleCreateSchema.partial()

// ── Marks entry ─────────────────────────────────────────────────────────────
export const marksRowSchema = z.object({
  studentId: z.string().min(1),
  marks: z.number().min(0, 'Marks cannot be negative'),
  absent: z.boolean().optional(),
})
export const marksEntrySchema = z.object({
  classSubjectId: z.string().min(1, 'Select the subject'),
  maxMarks: z.number().int().min(1).max(1000).optional(),
  rows: z.array(marksRowSchema).min(1, 'Nothing to save'),
})

// ── Report cards ────────────────────────────────────────────────────────────
export const reportCardGenerateSchema = z.object({
  examId: z.string().min(1, 'Select the exam'),
  classId: z.string().min(1, 'Select the class'),
})
export const reportCardUpdateSchema = z.object({
  teacherRemark: z.string().trim().max(400).optional().nullable(),
  principalRemark: z.string().trim().max(400).optional().nullable(),
  published: z.boolean().optional(),
})
