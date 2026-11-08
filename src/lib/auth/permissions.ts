// Role-based access control — pure logic (no db imports)

export const ALL_PERMISSIONS = [
  'students.read', 'students.write',
  'admissions.read', 'admissions.write',
  'academic.read', 'academic.write',
  'timetable.read', 'timetable.write',
  'attendance.read', 'attendance.write',
  'exams.read', 'exams.marks', 'exams.write',
  'assignments.read', 'assignments.write',
  'fees.read', 'fees.write',
  'accounts.read', 'accounts.write',
  'hr.read', 'hr.write', 'hr.leave.write',
  'inventory.read', 'inventory.write',
  'communication.read', 'communication.write',
  'reports.read', 'reports.write',
  'users.read', 'users.write',
  'roles.read', 'roles.write',
  'settings.read', 'settings.write',
  'school.read', 'school.write',
  'audit.read',
  'portal',
] as const

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: ['*'],
  PRINCIPAL: ['*.read', 'students.write', 'admissions.write', 'academic.write', 'timetable.write',
    'attendance.write', 'exams.write', 'assignments.write', 'communication.write', 'reports.write',
    'hr.read', 'hr.leave.write', 'audit.read', 'fees.read', 'portal'],
  TEACHER: ['students.read', 'admissions.read', 'academic.read', 'timetable.read', 'timetable.write',
    'attendance.read', 'attendance.write', 'exams.read', 'exams.marks', 'assignments.read',
    'assignments.write', 'communication.read', 'portal', 'reports.read'],
  ACCOUNTANT: ['students.read', 'academic.read', 'fees.*', 'accounts.*', 'reports.read',
    'communication.read', 'portal'],
  LIBRARIAN: ['inventory.read', 'inventory.write', 'students.read', 'communication.read', 'portal'],
  HR: ['hr.*', 'students.read', 'reports.read', 'communication.read', 'portal'],
  PARENT: ['portal', 'communication.read'],
  STUDENT: ['portal', 'communication.read'],
}

export const SYSTEM_ROLES = Object.keys(ROLE_DEFAULTS)

/**
 * Permission match:
 *  '*'        → everything
 *  'fees.*'   → anything starting 'fees.'
 *  '*.read'   → anything ending '.read'
 *  exact      → literal match
 */
export function can(perms: string[], needed?: string): boolean {
  if (!needed) return true
  return perms.some(p => {
    if (p === '*') return true
    if (p.endsWith('.*')) return needed.startsWith(p.slice(0, -1))
    if (p.startsWith('*.')) return needed.endsWith('.' + p.slice(2))
    return p === needed
  })
}

export function mergePermissions(primary: string[], extra: string[] = []): string[] {
  return Array.from(new Set([...primary, ...extra]))
}
