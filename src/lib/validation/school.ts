import { z } from 'zod'

export const updateSchoolSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  type: z.enum(['SCHOOL', 'COLLEGE', 'TUITION_CENTRE', 'ACADEMY']).optional(),
  address: z.string().max(200).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(80).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  motto: z.string().max(160).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0F766E').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  timezone: z.string().max(60).optional(),
  locale: z.string().max(10).optional(),
})

export const upsertSettingSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.unknown(),
})

export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>
