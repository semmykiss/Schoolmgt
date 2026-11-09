import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(3).max(120),
  role: z.enum(['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR', 'PARENT', 'STUDENT']),
  phone: z.string().max(30).optional(),
  branchId: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const updateUserSchema = z.object({
  fullName: z.string().min(3).max(120).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.enum(['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR', 'PARENT', 'STUDENT']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  branchId: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
