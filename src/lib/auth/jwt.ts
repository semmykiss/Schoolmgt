import { SignJWT, jwtVerify } from 'jose'

export interface AccessPayload {
  sub: string // userId
  sid: string // schoolId
  role: string
  name: string
  brn?: string | null // branchId
}

export const ACCESS_TTL = Number(process.env.SD_ACCESS_TTL || 900) // 15 min
export const REFRESH_TTL = Number(process.env.SD_REFRESH_TTL || 604800) // 7 days

function accessSecret() {
  return new TextEncoder().encode(process.env.SD_JWT_ACCESS_SECRET || 'schooldesk-dev-access-secret-change-me')
}

export async function signAccessToken(payload: AccessPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(accessSecret())
}

export async function verifyAccessToken(token: string): Promise<AccessPayload | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret())
    if (!payload.sub || !payload.sid) return null
    return {
      sub: payload.sub as string,
      sid: payload.sid as string,
      role: payload.role as string,
      name: payload.name as string,
      brn: (payload.brn as string | null) ?? null,
    }
  } catch {
    return null
  }
}
