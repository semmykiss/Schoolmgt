import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { employeeOfUser, employeeName } from '@/lib/api/portal'
import { assignmentCreateSchema } from '@/lib/validation/assignments'

export const GET = createHandler({ permission: 'assignments.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 25 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const classId = query.get('classId')
  const subjectId = query.get('subjectId')
  if (classId) where.classId = classId
  if (subjectId) where.subjectId = subjectId
  if (user.role === 'TEACHER') {
    // Teachers see the homework they posted (plus anything in their classes is left to admins)
    const emp = await employeeOfUser(user.schoolId, user.id)
    if (emp) where.teacherId = emp.id
  }
  if (q.search) where.title = { contains: q.search }

  const [items, total] = await Promise.all([
    db.assignment.findMany({
      where,
      orderBy: { dueDate: 'desc' },
      include: {
        class: { select: { id: true, name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { submissions: true } },
      },
      skip: q.skip,
      take: q.take,
    }),
    db.assignment.count({ where }),
  ])
  return {
    ...paginated(items.map(a => ({ ...a, teacher: a.teacher ? { id: a.teacher.id, fullName: employeeName(a.teacher) } : null })), total, q),
  }
})

export const POST = createHandler({ permission: 'assignments.write', body: assignmentCreateSchema }, async ({ user, body, audit }) => {
  const [cls, subject] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } }),
    db.subject.findFirst({ where: { id: body.subjectId, schoolId: user.schoolId } }),
  ])
  if (!cls) throw notFound('Selected class does not exist')
  if (!subject) throw notFound('Selected subject does not exist')

  let teacherId = body.teacherId ?? null
  if (user.role === 'TEACHER') {
    // Teachers always post as themselves
    const emp = await employeeOfUser(user.schoolId, user.id)
    teacherId = emp?.id ?? null
  } else if (teacherId) {
    const emp = await db.employee.findFirst({ where: { id: teacherId, schoolId: user.schoolId } })
    if (!emp) throw notFound('Selected teacher does not exist')
  }

  const assignment = await db.assignment.create({
    data: {
      schoolId: user.schoolId,
      classId: body.classId,
      subjectId: body.subjectId,
      teacherId,
      title: body.title,
      description: body.description || null,
      dueDate: body.dueDate,
    },
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // Notify portal-linked students (and their guardians) in the class
  const students = await db.student.findMany({
    where: {
      schoolId: user.schoolId,
      classId: body.classId,
      status: 'ACTIVE',
      OR: [
        { userId: { not: null } },
        { guardians: { some: { guardian: { userId: { not: null } } } } },
      ],
    },
    select: {
      userId: true,
      guardians: { select: { guardian: { select: { userId: true } } } },
    },
  })
  const userIds = new Set<string>()
  for (const s of students) {
    if (s.userId) userIds.add(s.userId)
    for (const g of s.guardians) if (g.guardian.userId) userIds.add(g.guardian.userId)
  }
  if (userIds.size > 0) {
    await db.notification.createMany({
      data: [...userIds].map(userId => ({
        schoolId: user.schoolId,
        userId,
        title: 'New homework posted',
        body: `${subject.name} — ${body.title}, due ${body.dueDate}.`,
        type: 'ANNOUNCEMENT',
        link: '#/portal',
      })),
    })
  }

  audit({
    action: 'create',
    entity: 'assignment',
    entityId: assignment.id,
    summary: `Posted homework "${body.title}" (${subject.name}) for ${cls.name}`,
  })
  return {
    ...assignment,
    teacher: assignment.teacher ? { id: assignment.teacher.id, fullName: employeeName(assignment.teacher) } : null,
  }
})
