// Zod schemas for Admissions + Students

import { z } from 'zod'

export const APPLICANT_STATUSES = ['APPLIED', 'INTERVIEW', 'ADMITTED', 'REJECTED', 'WAITLISTED'] as const
export const GENDERS = ['MALE', 'FEMALE'] as const
export const STUDENT_STATUSES = ['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'LEFT'] as const
export const GUARDIAN_RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'SPONSOR'] as const
export const EXIT_REASONS = ['TRANSFERRED_OUT', 'GRADUATED', 'WITHDRAWN', 'MEDICAL', 'FINANCIAL', 'OTHER'] as const

const phone = z.string().trim().regex(/^(\+?234|0)[\d\s-]{7,14}$/, 'Use a Nigerian phone number, e.g. 0803 000 0000')

// ── Applicants ──────────────────────────────────────────────────────────────
export const applicantCreateSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  gender: z.enum(GENDERS),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  classAppliedId: z.string().optional().nullable(),
  parentName: z.string().trim().min(2, 'Parent/guardian name is required').max(120),
  parentPhone: phone,
  parentEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  previousSchool: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const applicantUpdateSchema = applicantCreateSchema.partial().extend({
  status: z.enum(APPLICANT_STATUSES).optional(),
  interviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export const applicantConvertSchema = z.object({
  classId: z.string().min(1, 'Choose the class to enrol into'),
  sectionId: z.string().optional().nullable(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createPortalLogin: z.boolean().default(false),
})

// ── Students ────────────────────────────────────────────────────────────────
export const studentCreateSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  otherName: z.string().trim().max(60).optional().or(z.literal('')),
  gender: z.enum(GENDERS),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  classId: z.string().optional().nullable(),
  sectionId: z.string().optional().nullable(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  bloodGroup: z.string().trim().max(5).optional().or(z.literal('')),
  medicalNotes: z.string().trim().max(2000).optional().or(z.literal('')),
  branchId: z.string().optional().nullable(),
})

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  status: z.enum(STUDENT_STATUSES).optional(),
})

export const guardianSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(60),
  lastName: z.string().trim().min(2, 'Last name is required').max(60),
  relation: z.enum(GUARDIAN_RELATIONS).default('GUARDIAN'),
  phone: phone,
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  occupation: z.string().trim().max(80).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  isPrimary: z.boolean().default(true),
})

export const linkGuardianSchema = z.object({
  guardianId: z.string().optional(),
  new: guardianSchema.optional(),
  relation: z.enum(GUARDIAN_RELATIONS).default('GUARDIAN'),
}).refine(v => v.guardianId || v.new, { message: 'Pick an existing guardian or enter a new one' })

export const studentExitSchema = z.object({
  status: z.enum(['TRANSFERRED', 'GRADUATED', 'LEFT', 'SUSPENDED']),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exitReason: z.enum(EXIT_REASONS),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
})

export const studentImportRowSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  otherName: z.string().trim().optional().or(z.literal('')),
  gender: z.enum(GENDERS),
  className: z.string().trim().optional().or(z.literal('')),
  dateOfBirth: z.string().trim().optional().or(z.literal('')),
  admissionDate: z.string().trim().optional().or(z.literal('')),
  guardianName: z.string().trim().optional().or(z.literal('')),
  guardianPhone: z.string().trim().optional().or(z.literal('')),
})

export const studentImportSchema = z.object({
  rows: z.array(studentImportRowSchema).min(1, 'No rows to import').max(500),
})
