import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  schoolName: z.string().min(3, 'School name must be at least 3 characters').max(120),
  schoolType: z.enum(['SCHOOL', 'COLLEGE', 'TUITION_CENTRE', 'ACADEMY']).default('SCHOOL'),
  adminName: z.string().min(3, 'Enter the administrator’s full name').max(120),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().max(30).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
