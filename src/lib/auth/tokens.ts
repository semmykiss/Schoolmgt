import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { REFRESH_TTL } from './jwt'
import { ApiError } from '@/lib/api/errors'

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export interface TokenMeta { userAgent?: string | null; ip?: string | null }

/** Create a new opaque refresh token (returned raw; only the hash is stored). */
export async function issueRefreshToken(userId: string, meta: TokenMeta): Promise<string> {
  const raw = crypto.randomBytes(48).toString('base64url')
  await db.refreshToken.create({ data: {
    userId,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  } })
  return raw
}

/**
 * Rotate a refresh token: revoke the presented one, issue a fresh pair.
 * Reuse of a revoked token is treated as theft → revoke the whole family.
 */
export async function rotateRefreshToken(raw: string, meta: TokenMeta): Promise<{ userId: string; token: string }> {
  const stored = await db.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } })
  if (!stored) throw new ApiError(401, 'Invalid refresh token')
  if (stored.revokedAt) {
    await db.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    throw new ApiError(401, 'Refresh token reuse detected — please sign in again')
  }
  if (stored.expiresAt < new Date()) throw new ApiError(401, 'Refresh token expired')

  const newRaw = await issueRefreshToken(stored.userId, meta)
  await db.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })
  return { userId: stored.userId, token: newRaw }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await db.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } })
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}
