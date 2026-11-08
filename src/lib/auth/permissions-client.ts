// Client-side permission check (mirror of server logic in lib/auth/permissions.ts)

export function can(perms: string[], needed?: string): boolean {
  if (!needed) return true
  return perms.some(p => {
    if (p === '*') return true
    if (p.endsWith('.*')) return needed.startsWith(p.slice(0, -1))
    if (p.startsWith('*.')) return needed.endsWith('.' + p.slice(2))
    return p === needed
  })
}
