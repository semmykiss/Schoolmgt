// Zod schemas for the Academic module (sessions, terms, classes, sections,
// subjects, class-subject teacher assignment, lesson plans, promotions).
// Dates are plain "YYYY-MM-DD" strings — TZ-safe by convention.

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')

export const TERM_NAMES = ['FIRST', 'SECOND', 'THIRD'] as const
export const CLASS_CATEGORIES = ['PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'] as const
export const PLAN_TYPES = ['SYLLABUS', 'LESSON_PLAN'] as const
export const PROMOTION_ACTIONS = ['PROMOTE', 'HOLD_BACK', 'GRADUATE'] as const

// ── Sessions ────────────────────────────────────────────────────────────────
export const sessionCreateSchema = z.object({
  name: z.string().trim().min(3, 'Session name is required, e.g. 2025/2026').max(30),
  startDate: dateStr,
  endDate: dateStr,
  setCurrent: z.boolean().optional(),
}).refine(v => v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] })

export const sessionUpdateSchema = z.object({
  name: z.string().trim().min(3).max(30).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  setCurrent: z.boolean().optional(),
}).refine(v => !v.startDate || !v.endDate || v.endDate > v.startDate, {
  message: 'End date must be after the start date', path: ['endDate'],
})

// ── Terms ───────────────────────────────────────────────────────────────────
export const termCreateSchema = z.object({
  sessionId: z.string().min(1, 'Select the owning session'),
  name: z.enum(TERM_NAMES, { message: 'Term must be First, Second or Third' }),
  startDate: dateStr,
  endDate: dateStr,
  setCurrent: z.boolean().optional(),
}).refine(v => v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] })

export const termUpdateSchema = z.object({
  name: z.enum(TERM_NAMES).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  setCurrent: z.boolean().optional(),
}).refine(v => !v.startDate || !v.endDate || v.endDate > v.startDate, {
  message: 'End date must be after the start date', path: ['endDate'],
})

// ── Classes & sections ──────────────────────────────────────────────────────
export const classCreateSchema = z.object({
  name: z.string().trim().min(2, 'Class name is required, e.g. JSS 1').max(60),
  level: z.coerce.number().int('Level must be a whole number').min(1, 'Level must be at least 1').max(20, 'Level is too large'),
  category: z.enum(CLASS_CATEGORIES).optional(),
})

export const classUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  level: z.coerce.number().int().min(1).max(20).optional(),
  category: z.enum(CLASS_CATEGORIES).optional(),
})

export const sectionCreateSchema = z.object({
  classId: z.string().min(1, 'Select the owning class'),
  name: z.string().trim().min(1, 'Section name is required, e.g. A').max(10),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(200, 'Capacity is too large').default(40),
  formTeacherId: z.string().optional().nullable(),
})

export const sectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(10).optional(),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
  formTeacherId: z.string().optional().nullable(),
})

// ── Subjects & teacher assignment ───────────────────────────────────────────
export const subjectCreateSchema = z.object({
  name: z.string().trim().min(2, 'Subject name is required').max(80),
  code: z.string().trim().max(10).optional().or(z.literal('')),
  isCore: z.boolean().default(true),
})

export const subjectUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  code: z.string().trim().max(10).optional().or(z.literal('')),
  isCore: z.boolean().optional(),
})

export const classSubjectCreateSchema = z.object({
  classId: z.string().min(1, 'Select a class'),
  subjectId: z.string().min(1, 'Select a subject'),
  teacherId: z.string().optional().nullable(),
})

export const classSubjectUpdateSchema = z.object({
  teacherId: z.string().optional().nullable(),
})

// ── Lesson plans / syllabus ─────────────────────────────────────────────────
export const lessonPlanCreateSchema = z.object({
  classSubjectId: z.string().min(1, 'Select the class + subject'),
  termId: z.string().min(1, 'Select the term'),
  type: z.enum(PLAN_TYPES).default('LESSON_PLAN'),
  week: z.coerce.number().int().min(1).max(20).optional().nullable(),
  topic: z.string().trim().min(2, 'Topic is required').max(200),
  objectives: z.string().trim().max(4000).optional().or(z.literal('')),
  content: z.string().trim().max(8000).optional().or(z.literal('')),
  resources: z.string().trim().max(1000).optional().or(z.literal('')),
})

export const lessonPlanUpdateSchema = lessonPlanCreateSchema.partial().omit({ classSubjectId: true, termId: true })

// ── Promotions ──────────────────────────────────────────────────────────────
export const promotionEntrySchema = z.object({
  studentId: z.string().min(1),
  action: z.enum(PROMOTION_ACTIONS),
  toClassId: z.string().optional().nullable(),
  toSectionId: z.string().optional().nullable(),
})

export const promotionRunSchema = z.object({
  entries: z.array(promotionEntrySchema).min(1, 'Pick at least one student'),
})
