import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'

const STAFF_ROLES = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR']

export const GET = createHandler({ roles: STAFF_ROLES }, async ({ user, query }) => {
  const q = (query.get('q') || '').trim()
  if (q.length < 2) throw badRequest('Type at least 2 characters')
  const contains = { contains: q }

  const [students, staff] = await Promise.all([
    db.student.findMany({
      where: { schoolId: user.schoolId, OR: [
        { firstName: contains }, { lastName: contains }, { admissionNumber: contains },
      ] },
      include: { class: { select: { name: true } } },
      take: 5, orderBy: { lastName: 'asc' },
    }),
    db.employee.findMany({
      where: { schoolId: user.schoolId, OR: [{ firstName: contains }, { lastName: contains }, { staffCode: contains }] },
      take: 5, orderBy: { lastName: 'asc' },
    }),
  ])

  return {
    students: students.map(s => ({
      id: s.id, label: `${s.firstName} ${s.lastName}`,
      sub: `${s.admissionNumber}${s.class ? ` • ${s.class.name}` : ''}`, status: s.status,
    })),
    staff: staff.map(e => ({
      id: e.id, label: `${e.firstName} ${e.lastName}`,
      sub: `${e.staffCode} • ${e.position}`,
    })),
  }
})
