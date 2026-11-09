import { z } from 'zod'

export const REPORT_KEY_VALUES = ['enrollment', 'academic', 'financial', 'attendance'] as const

export const saveFilterSchema = z.object({
  module: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  criteria: z.record(z.string(), z.unknown()).default({}),
})

export const updateFilterSchema = saveFilterSchema.partial()

export const scheduledExportCreateSchema = z.object({
  reportKey: z.enum(REPORT_KEY_VALUES),
  name: z.string().min(1).max(80),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  format: z.enum(['CSV', 'PDF']).default('CSV'),
  recipients: z.array(z.string().email('Enter valid email addresses')).min(1, 'At least one recipient'),
  filters: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
})

export const scheduledExportUpdateSchema = scheduledExportCreateSchema.partial()

export const backupNameSchema = z.string().regex(/^schooldesk-backup-[\w.-]+\.db$/, 'Invalid backup file name')

export type SaveFilterInput = z.infer<typeof saveFilterSchema>
export type ScheduledExportCreateInput = z.infer<typeof scheduledExportCreateSchema>
