// Zod schemas for the Homework/Assignments module (Phase 6) — shared by
// /assignments, /assignments/[id]/submissions and the staff Homework view.

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')

// ── Assignments (homework posts) ────────────────────────────────────────────
export const assignmentCreateSchema = z.object({
  classId: z.string().min(1, 'Select the class'),
  subjectId: z.string().min(1, 'Select the subject'),
  teacherId: z.string().min(1).nullish(),
  title: z.string().trim().min(3, 'Title is required').max(140),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  dueDate: dateStr,
})
export const assignmentUpdateSchema = assignmentCreateSchema.partial()

// ── Submissions (student/parent turn-in) ────────────────────────────────────
export const submissionCreateSchema = z.object({
  studentId: z.string().min(1).optional(), // required for parents with several children
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  fileUrl: z.string().trim().max(500).optional().or(z.literal('')),
})

// ── Grading (teacher marks a submission) ────────────────────────────────────
export const submissionGradeSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  score: z.number().min(0).max(1000).nullish(),
  status: z.enum(['SUBMITTED', 'LATE', 'GRADED']).optional(),
})
