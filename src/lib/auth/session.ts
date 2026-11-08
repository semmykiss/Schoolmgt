import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAccessToken, ACCESS_TTL, REFRESH_TTL } from './jwt'
import { ROLE_DEFAULTS, mergePermissions } from './permissions'

export const COOKIES = { access: 'sd_access', refresh: 'sd_refresh' } as const

export interface AuthedUser {
  id: string
  schoolId: string
  branchId: string | null
  role: string
  fullName: string
  email: string
  avatarUrl: string | null
  permissions: string[]
}

export interface SessionPayload {
  user: { id: string; email: string; fullName: string; role: string; avatarUrl: string | null; phone: string | null; branchId: string | null; permissions: string[] }
  school: { id: string; name: string; slug: string; type: string; logoUrl: string | null; primaryColor: string; secondaryColor: string; currency: string; city: string | null; state: string | null; country: string; phone: string | null; email: string | null; motto: string | null; address: string | null; timezone: string }
  branches: { id: string; name: string; code: string; isMain: boolean }[]
}

async function permissionsFor(schoolId: string, role: string): Promise<string[]> {
  const defaults = ROLE_DEFAULTS[role] ?? ['portal']
  const custom = await db.role.findUnique({ where: { schoolId_name: { schoolId, name: role } } })
  return mergePermissions(defaults, custom ? (JSON.parse(custom.permissions) as string[]) : [])
}

/** Build an AuthedUser (with resolved permissions) from a user record. */
export async function authedFromRecord(user: {
  id: string; schoolId: string; branchId: string | null; role: string
  fullName: string; email: string; avatarUrl: string | null
}): Promise<AuthedUser> {
  return { ...user, permissions: await permissionsFor(user.schoolId, user.role) }
}

/** Resolve the authenticated user from cookie or Bearer header (null if anonymous). */
export async function getAuthUser(req: NextRequest): Promise<AuthedUser | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const token = req.cookies.get(COOKIES.access)?.value || bearer
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({ where: { id: payload.sub } })
  if (!user || user.status !== 'ACTIVE') return null
  return authedFromRecord(user)
}

export async function sessionPayloadFor(user: AuthedUser): Promise<SessionPayload> {
  const [full, school, branches] = await Promise.all([
    db.user.findUnique({ where: { id: user.id } }),
    db.school.findUnique({ where: { id: user.schoolId } }),
    db.branch.findMany({ where: { schoolId: user.schoolId }, orderBy: { isMain: 'desc' } }),
  ])
  if (!full || !school) throw new Error('Session payload missing records')
  return {
    user: {
      id: full.id, email: full.email, fullName: full.fullName, role: full.role,
      avatarUrl: full.avatarUrl, phone: full.phone, branchId: full.branchId,
      permissions: user.permissions,
    },
    school: {
      id: school.id, name: school.name, slug: school.slug, type: school.type,
      logoUrl: school.logoUrl, primaryColor: school.primaryColor, secondaryColor: school.secondaryColor,
      currency: school.currency, city: school.city, state: school.state, country: school.country,
      phone: school.phone, email: school.email, motto: school.motto, address: school.address,
      timezone: school.timezone,
    },
    branches: branches.map(b => ({ id: b.id, name: b.name, code: b.code, isMain: b.isMain })),
  }
}

export function authResponse(data: unknown, tokens: { access: string; refresh: string }) {
  const res = NextResponse.json({ data })
  res.cookies.set(COOKIES.access, tokens.access, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: ACCESS_TTL })
  res.cookies.set(COOKIES.refresh, tokens.refresh, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: REFRESH_TTL })
  return res
}

export function clearAuthResponse(data: unknown = { ok: true }) {
  const res = NextResponse.json({ data })
  res.cookies.set(COOKIES.access, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  res.cookies.set(COOKIES.refresh, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
