// In-app notification fan-out helpers (server-only: touches the database).
// Keeps notification creation consistent across modules.

import { db } from '@/lib/db'
import { ROLE_DEFAULTS, can, mergePermissions } from '@/lib/auth/permissions'

export interface NotifyPayload {
  title: string
  body?: string | null
  type?: string // ATTENDANCE | FEE | RESULT | ANNOUNCEMENT | SYSTEM | LEAVE | PAYROLL
  /** Deep link, or a resolver that picks one per recipient (e.g. by role). */
  link?: string | null | ((user: { id: string; role?: string }) => string | null)
}

/**
 * All ACTIVE users in the school whose effective permissions (role defaults +
 * per-school overrides) include `permission` — e.g. everyone who may approve
 * leave (`hr.leave.write`).
 */
export async function usersWithPermission(
  schoolId: string,
  permission: string,
): Promise<{ id: string }[]> {
  const customs = await db.role.findMany({ where: { schoolId } })
  const byName = new Map(customs.map(r => [r.name, JSON.parse(r.permissions) as string[]]))
  const roleNames = Object.keys(ROLE_DEFAULTS).filter(name => {
    const perms = mergePermissions(ROLE_DEFAULTS[name] ?? [], byName.get(name) ?? [])
    return can(perms, permission)
  })
  if (roleNames.length === 0) return []
  return db.user.findMany({
    where: { schoolId, status: 'ACTIVE', role: { in: roleNames } },
    select: { id: true },
  })
}

/** Create notifications for a set of users (deduplicated, empty-safe). */
export async function notifyUsers(
  schoolId: string,
  userIds: Iterable<{ id: string; role?: string } | string>,
  payload: NotifyPayload,
): Promise<number> {
  const normalized = [...userIds].map(u => (typeof u === 'string' ? { id: u } : u))
  const ids = [...new Set(normalized.map(u => u.id))].filter(Boolean)
  if (ids.length === 0) return 0
  const roleOf = new Map(normalized.map(u => [u.id, u.role]))
  await db.notification.createMany({
    data: ids.map(userId => ({
      schoolId,
      userId,
      title: payload.title,
      body: payload.body ?? null,
      type: payload.type ?? 'SYSTEM',
      link: typeof payload.link === 'function' ? payload.link({ id: userId, role: roleOf.get(userId) }) : payload.link ?? null,
    })),
  })
  return ids.length
}

/**
 * Users to notify about a student's activity — the student's own login (if
 * any) plus every linked guardian login. Returns user ids, deduplicated.
 */
export async function studentCircleUserIds(
  student: { userId?: string | null; guardians?: { guardian: { userId?: string | null } }[] },
): Promise<string[]> {
  const ids = new Set<string>()
  if (student.userId) ids.add(student.userId)
  for (const g of student.guardians ?? []) if (g.guardian.userId) ids.add(g.guardian.userId)
  return [...ids]
}
