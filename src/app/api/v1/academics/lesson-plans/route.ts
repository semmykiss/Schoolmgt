import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { lessonPlanCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const classSubjectId = query.get('classSubjectId')
  const termId = query.get('termId')
  const type = query.get('type')
  if (classSubjectId) where.classSubjectId = classSubjectId
  if (termId) where.termId = termId
  if (type) where.type = type
  if (q.search) where.topic = { contains: q.search }

  const [items, total] = await Promise.all([
    db.lessonPlan.findMany({
      where,
      include: { classSubject: {
        include: {
          class: { select: { id: true, name: true, level: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      } },
      orderBy: [{ termId: 'desc' }, { week: 'asc' }, { createdAt: 'desc' }],
      skip: q.skip, take: q.take,
    }),
    db.lessonPlan.count({ where }),
  ])
  return paginated(items.map(p => ({
    ...p,
    classSubject: p.classSubject.teacher
      ? { ...p.classSubject, teacher: { id: p.classSubject.teacher.id, fullName: `${p.classSubject.teacher.firstName} ${p.classSubject.teacher.lastName}` } }
      : { ...p.classSubject, teacher: null },
  })), total, q)
})

export const POST = createHandler({ permission: 'academic.lessonplans.write', body: lessonPlanCreateSchema }, async ({ user, body, audit }) => {
  const classSubject = await db.classSubject.findFirst({
    where: { id: body.classSubjectId, schoolId: user.schoolId },
    include: { class: true, subject: true },
  })
  if (!classSubject) throw notFound('Class subject assignment not found')
  const term = await db.term.findFirst({ where: { id: body.termId, schoolId: user.schoolId } })
  if (!term) throw notFound('Term not found')

  const created = await db.lessonPlan.create({ data: {
    schoolId: user.schoolId, classSubjectId: body.classSubjectId, termId: body.termId,
    type: body.type, week: body.week ?? null, topic: body.topic.trim(),
    objectives: body.objectives?.trim() || null,
    content: body.content?.trim() || null,
    resources: body.resources?.trim() || null,
  } })
  audit({ action: 'CREATE', entity: 'LessonPlan', entityId: created.id, summary: `Added ${body.type === 'SYLLABUS' ? 'syllabus' : 'lesson plan'} "${body.topic}" for ${classSubject.class.name} ${classSubject.subject.name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
