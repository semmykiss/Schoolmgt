// Zod schemas for the Communication module (Phase 7) — shared by
// /communication/announcements, /communication/events, /communication/templates,
// /communication/send and the staff views.

import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')

// ── Announcements ───────────────────────────────────────────────────────────
export const announcementCreateSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(160),
  body: z.string().trim().min(1, 'Message body is required').max(8000),
  audience: z.enum(['ALL', 'STAFF', 'PARENTS', 'STUDENTS', 'CLASS']).default('ALL'),
  classId: z.string().min(1).nullish(),
  pinned: z.boolean().default(false),
  startAt: dateStr.nullish(),
  endAt: dateStr.nullish(),
})
export const announcementUpdateSchema = announcementCreateSchema.partial().extend({
  published: z.boolean().optional(), // true → publish now, false → revert to draft
})

// ── Calendar events ─────────────────────────────────────────────────────────
export const eventCreateSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(160),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  type: z.enum(['EXAM', 'HOLIDAY', 'MEETING', 'ACTIVITY', 'OTHER']).default('OTHER'),
  startDate: dateStr,
  endDate: dateStr,
  audience: z.enum(['ALL', 'STAFF', 'PARENTS', 'STUDENTS', 'CLASS']).default('ALL'),
  classId: z.string().min(1).nullish(),
}).refine(v => v.endDate >= v.startDate, {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
})
export const eventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  type: z.enum(['EXAM', 'HOLIDAY', 'MEETING', 'ACTIVITY', 'OTHER']).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  audience: z.enum(['ALL', 'STAFF', 'PARENTS', 'STUDENTS', 'CLASS']).optional(),
  classId: z.string().min(1).nullish(),
}).refine(v => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
})

// ── Message templates ───────────────────────────────────────────────────────
export const templateCreateSchema = z.object({
  name: z.string().trim().min(3, 'Name is required').max(80),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  body: z.string().trim().min(1, 'Template body is required').max(8000),
})
export const templateUpdateSchema = templateCreateSchema.partial()

// ── Outbound messaging (compose + preview) ──────────────────────────────────
export const audienceSchema = z.object({
  type: z.enum(['ALL_STAFF', 'ALL_PARENTS', 'ALL_STUDENTS', 'CLASS', 'CUSTOM']),
  classId: z.string().min(1).nullish(),
  studentIds: z.array(z.string().min(1)).max(500).nullish(),
  employeeIds: z.array(z.string().min(1)).max(500).nullish(),
})

export const sendSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  templateId: z.string().min(1).nullish(),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  body: z.string().trim().max(8000).optional().or(z.literal('')),
  audience: audienceSchema,
}).refine(v => !!v.templateId || (v.body && v.body.length > 0), {
  message: 'Write a message or pick a template',
  path: ['body'],
}).refine(v => v.channel !== 'EMAIL' || !!v.templateId || !!(v.subject && v.subject.length > 0), {
  message: 'Email needs a subject (or pick a template)',
  path: ['subject'],
})

export const notificationReadSchema = z.object({
  ids: z.array(z.string().min(1)).max(100).optional(),
  all: z.boolean().optional(),
})
