// Audience resolution (Phase 7) — maps a broadcast audience to
//  1) in-app user ids (Notification rows)      → resolveAudienceUsers
//  2) outbound contact points (SMS/Email/WhatsApp) → resolveAudienceContacts
// Both are strictly school-scoped.

import { db } from '@/lib/db'
import { badRequest } from './errors'

export type PortalAudience = 'ALL' | 'STAFF' | 'PARENTS' | 'STUDENTS' | 'CLASS'

const STAFF_ROLES = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR']

/** Users who should receive an in-app notification for this audience. */
export async function resolveAudienceUsers(
  schoolId: string,
  audience: PortalAudience,
  classId?: string | null,
): Promise<{ id: string; role: string }[]> {
  switch (audience) {
    case 'STAFF':
      return db.user.findMany({
        where: { schoolId, status: 'ACTIVE', role: { in: STAFF_ROLES } },
        select: { id: true, role: true },
      })
    case 'PARENTS':
      return db.user.findMany({
        where: { schoolId, status: 'ACTIVE', role: 'PARENT', guardianProfile: { isNot: null } },
        select: { id: true, role: true },
      })
    case 'STUDENTS':
      return db.user.findMany({
        where: { schoolId, status: 'ACTIVE', role: 'STUDENT', studentProfile: { isNot: null } },
        select: { id: true, role: true },
      })
    case 'CLASS': {
      if (!classId) throw badRequest('Pick a class for class-scoped announcements')
      const students = await db.student.findMany({
        where: { schoolId, classId, status: 'ACTIVE' },
        select: {
          userId: true,
          guardians: { select: { guardian: { select: { userId: true } } } },
        },
      })
      const ids = new Set<string>()
      for (const s of students) {
        if (s.userId) ids.add(s.userId)
        for (const g of s.guardians) if (g.guardian.userId) ids.add(g.guardian.userId)
      }
      if (ids.size === 0) return []
      return db.user.findMany({
        where: { id: { in: [...ids] }, status: 'ACTIVE' },
        select: { id: true, role: true },
      })
    }
    default: // ALL
      return db.user.findMany({
        where: { schoolId, status: 'ACTIVE' },
        select: { id: true, role: true },
      })
  }
}

export interface AudienceContact {
  recipient: string          // phone (SMS/WhatsApp) or email
  name?: string              // person label for the log
  studentName?: string       // linked child, for {{student}} rendering
}

function dedupeContacts(contacts: AudienceContact[]): AudienceContact[] {
  const seen = new Set<string>()
  const out: AudienceContact[] = []
  for (const c of contacts) {
    const key = `${c.recipient.toLowerCase()}`
    if (!c.recipient || seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

export interface SendAudienceSpec {
  type: 'ALL_STAFF' | 'ALL_PARENTS' | 'ALL_STUDENTS' | 'CLASS' | 'CUSTOM'
  classId?: string | null
  studentIds?: string[] | null
  employeeIds?: string[] | null
}

/**
 * Outbound contact points for a broadcast. Students without their own
 * phone/email reach parents via guardian contacts (optionally tagged with the
 * child's name for template rendering).
 */
export async function resolveAudienceContacts(schoolId: string, spec: SendAudienceSpec): Promise<AudienceContact[]> {
  const studentContacts = async (studentIds?: string[], classId?: string | null) => {
    const students = await db.student.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        ...(studentIds && studentIds.length ? { id: { in: studentIds } } : {}),
        ...(classId ? { classId } : {}),
      },
      select: {
        firstName: true, lastName: true,
        user: { select: { email: true, phone: true } },
        guardians: { select: { guardian: { select: { phone: true, email: true, firstName: true, lastName: true } } } },
      },
    })
    const out: AudienceContact[] = []
    for (const s of students) {
      const studentName = `${s.firstName} ${s.lastName}`
      if (s.user?.email) out.push({ recipient: s.user.email, name: studentName, studentName })
      if (s.user?.phone) out.push({ recipient: s.user.phone, name: studentName, studentName })
      for (const g of s.guardians) {
        if (g.guardian.email) out.push({ recipient: g.guardian.email, name: `${g.guardian.firstName} ${g.guardian.lastName}`, studentName })
        if (g.guardian.phone) out.push({ recipient: g.guardian.phone, name: `${g.guardian.firstName} ${g.guardian.lastName}`, studentName })
      }
    }
    return out
  }

  const staffContacts = async (employeeIds?: string[]) => {
    const employees = await db.employee.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        ...(employeeIds && employeeIds.length ? { id: { in: employeeIds } } : {}),
      },
      select: { firstName: true, lastName: true, email: true, phone: true, user: { select: { email: true, phone: true } } },
    })
    const out: AudienceContact[] = []
    for (const e of employees) {
      const name = `${e.firstName} ${e.lastName}`
      if (e.email) out.push({ recipient: e.email, name })
      if (e.phone) out.push({ recipient: e.phone, name })
      if (e.user?.email && e.user.email !== e.email) out.push({ recipient: e.user.email, name })
      if (e.user?.phone && e.user.phone !== e.phone) out.push({ recipient: e.user.phone, name })
    }
    return out
  }

  const guardianContacts = async () => {
    const guardians = await db.guardian.findMany({
      where: { schoolId, students: { some: { student: { status: 'ACTIVE' } } } },
      select: { firstName: true, lastName: true, phone: true, email: true },
    })
    return guardians.flatMap(g => {
      const name = `${g.firstName} ${g.lastName}`
      const out: AudienceContact[] = []
      if (g.phone) out.push({ recipient: g.phone, name })
      if (g.email) out.push({ recipient: g.email, name })
      return out
    })
  }

  switch (spec.type) {
    case 'ALL_STAFF':
      return dedupeContacts(await staffContacts())
    case 'ALL_PARENTS':
      return dedupeContacts(await guardianContacts())
    case 'ALL_STUDENTS':
      return dedupeContacts(await studentContacts())
    case 'CLASS': {
      if (!spec.classId) throw badRequest('Pick a class for class broadcasts')
      // Reaches the class's students and their guardians
      return dedupeContacts(await studentContacts(undefined, spec.classId))
    }
    case 'CUSTOM': {
      const [kids, staff] = await Promise.all([
        spec.studentIds?.length ? studentContacts(spec.studentIds) : Promise.resolve([]),
        spec.employeeIds?.length ? staffContacts(spec.employeeIds) : Promise.resolve([]),
      ])
      return dedupeContacts([...kids, ...staff])
    }
  }
}

/** Keep recipient list aligned with the channel (emails vs phone numbers). */
export function contactsForChannel(contacts: AudienceContact[], channel: 'EMAIL' | 'SMS' | 'WHATSAPP'): AudienceContact[] {
  if (channel === 'EMAIL') return contacts.filter(c => c.recipient.includes('@'))
  return contacts.filter(c => !c.recipient.includes('@') && /\d/.test(c.recipient))
}
