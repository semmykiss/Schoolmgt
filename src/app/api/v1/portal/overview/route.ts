import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { forbidden } from '@/lib/api/errors'
import { currentTerm, portalStudentsFor, studentPortalSummary } from '@/lib/api/portal'

/**
 * GET /portal/overview — role-aware portal dashboard for parents & students.
 * Returns one summary per child (parents) or the student themself, covering
 * attendance %, latest published results, fees due, homework, today's
 * timetable and announcements.
 */
export const GET = createHandler({ permission: 'portal', roles: ['PARENT', 'STUDENT'] }, async ({ user }) => {
  const students = await portalStudentsFor(user)
  if (students.length === 0) {
    throw forbidden(
      user.role === 'STUDENT'
        ? 'Your account is not linked to a student profile yet — contact the school office'
        : 'No children are linked to your account yet — contact the school office',
    )
  }
  const term = await currentTerm(user.schoolId)
  const children = await Promise.all(students.map(s => studentPortalSummary(user.schoolId, s, term, user.role)))

  const unread = await db.notification.count({ where: { userId: user.id, read: false } })

  return {
    role: user.role,
    term: term ? { id: term.id, name: term.name, session: term.session.name } : null,
    unread,
    children,
  }
})
