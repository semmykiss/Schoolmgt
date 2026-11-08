import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { examCreateSchema } from '@/lib/validation/exams'

export const GET = createHandler({ permission: 'exams.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 50 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const termId = query.get('termId')
  const examTypeId = query.get('examTypeId')
  if (termId) where.termId = termId
  if (examTypeId) where.examTypeId = examTypeId
  if (q.search) where.name = { contains: q.search }

  const [items, total, counts] = await Promise.all([
    db.exam.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        term: { select: { id: true, name: true, sessionId: true, session: { select: { name: true, isCurrent: true } } } },
        examType: { select: { id: true, name: true, weight: true } },
        _count: { select: { schedules: true, results: true, reportCards: true } },
      },
      skip: q.skip, take: q.take,
    }),
    db.exam.count({ where }),
    db.exam.groupBy({
      by: ['publishResults'],
      where: { schoolId: user.schoolId },
      _count: { _all: true },
    }),
  ])
  const publishedCount = counts.find(c => c.publishResults === true)?._count._all ?? 0
  return { ...paginated(items, total, q), published: publishedCount, totalExams: total }
})

export const POST = createHandler({ permission: 'exams.write', body: examCreateSchema }, async ({ user, body, audit }) => {
  const [term, examType] = await Promise.all([
    db.term.findFirst({ where: { id: body.termId, schoolId: user.schoolId } }),
    db.examType.findFirst({ where: { id: body.examTypeId, schoolId: user.schoolId } }),
  ])
  if (!term) throw notFound('Selected term does not exist')
  if (!examType) throw notFound('Selected exam type does not exist')

  const dup = await db.exam.findFirst({
    where: { schoolId: user.schoolId, termId: body.termId, examTypeId: body.examTypeId },
    select: { id: true, name: true },
  })
  if (dup) throw badRequest(`This term already has a ${examType.name}. Edit "${dup.name}" instead.`)

  const created = await db.exam.create({
    data: {
      schoolId: user.schoolId,
      name: body.name,
      termId: body.termId,
      examTypeId: body.examTypeId,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
    },
    include: {
      term: { select: { id: true, name: true, sessionId: true, session: { select: { name: true, isCurrent: true } } } },
      examType: { select: { id: true, name: true, weight: true } },
      _count: { select: { schedules: true, results: true, reportCards: true } },
    },
  })
  audit({ action: 'CREATE', entity: 'Exam', entityId: created.id, summary: `Created exam "${created.name}"` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
