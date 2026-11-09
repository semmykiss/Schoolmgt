import { z, ZodError } from 'zod'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError } from './errors'
import { rateLimit, getIp } from './rate-limit'
import { getAuthUser, type AuthedUser } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'

export interface AuditEntry {
  action: string
  entity: string
  entityId?: string
  summary?: string
}

export interface HandlerCtx<B = undefined> {
  req: NextRequest
  params: Record<string, string>
  query: URLSearchParams
  user: AuthedUser
  body: B
  audit: (entry: AuditEntry) => void
}

export interface HandlerOpts<B> {
  auth?: boolean
  roles?: string[]
  permission?: string
  rateLimit?: { bucket: string; limit: number; windowMs: number }
  body?: z.ZodType<B>
}

type RouteCtx = { params: Promise<Record<string, string | string[]>> }

function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { message: 'Validation failed', code: 'VALIDATION', details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) } },
      { status: 400 },
    )
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { message: err.message, code: err.code, details: err.details } },
      { status: err.status },
    )
  }
  console.error('[api] unhandled error:', err)
  return NextResponse.json({ error: { message: 'Internal server error', code: 'INTERNAL' } }, { status: 500 })
}

/**
 * Standard API route wrapper:
 *   rate-limit → auth → role/permission check → zod body validation → handler → audit → { data } envelope
 * Always scopes by the authenticated user's schoolId — handlers must use ctx.user.schoolId.
 */
export function createHandler<B = undefined>(opts: HandlerOpts<B>, fn: (ctx: HandlerCtx<B>) => Promise<unknown>) {
  return async (req: NextRequest, route?: RouteCtx): Promise<Response> => {
    try {
      const url = new URL(req.url)
      if (opts.rateLimit) {
        const r = rateLimit(`${opts.rateLimit.bucket}:${getIp(req)}`, opts.rateLimit.limit, opts.rateLimit.windowMs)
        if (!r.ok) throw new ApiError(429, `Too many requests — try again in ${r.retryAfterSec}s`, 'RATE_LIMITED')
      }

      let user = null as AuthedUser | null
      if (opts.auth !== false) {
        user = await getAuthUser(req)
        if (!user) throw new ApiError(401, 'Please sign in to continue')
        if (opts.roles && !opts.roles.includes(user.role)) throw new ApiError(403, 'Your role cannot access this resource', 'FORBIDDEN')
        if (opts.permission && !can(user.permissions, opts.permission)) throw new ApiError(403, `Missing permission: ${opts.permission}`, 'FORBIDDEN')
      }

      let body = undefined as B
      if (opts.body && !['GET', 'HEAD'].includes(req.method)) {
        const raw = await req.json().catch(() => { throw new ApiError(400, 'Request body must be valid JSON') })
        body = opts.body.parse(raw)
      }

      const params = route?.params ? await route.params : {}
      const entries: (AuditEntry & { userId?: string; userName?: string })[] = []
      const result = await fn({
        req, params: params as Record<string, string>, query: url.searchParams,
        user: user as AuthedUser, body,
        audit: e => entries.push({ ...e, userId: user?.id, userName: user?.fullName }),
      })

      if (entries.length && user) {
        await db.auditLog.createMany({ data: entries.map(e => ({
          schoolId: user.schoolId, userId: e.userId, userName: e.userName,
          action: e.action, entity: e.entity, entityId: e.entityId, summary: e.summary,
          ip: getIp(req),
        })) })
      }

      if (result instanceof Response) return result
      return NextResponse.json({ data: result ?? null })
    } catch (err) {
      return errorResponse(err)
    }
  }
}
