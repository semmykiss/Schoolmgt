import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { parseListQuery, paginated } from '@/lib/api/paginate'
import { classCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 100 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (q.search) where.name = { contains: q.search }
  const category = query.get('category')
  if (category) where.category = category

  const [items, total] = await Promise.all([
    db.schoolClass.findMany({
      where,
      include: {
        sections: { orderBy: { name: 'asc' }, include: { formTeacher: { select: { id: true, firstName: true, lastName: true, staffCode: true } } } },
        _count: { select: { students: { where: { status: 'ACTIVE' } }, sections: true, classSubjects: true } },
      },
      orderBy: { level: 'asc' },
      skip: q.skip, take: q.take,
    }),
    db.schoolClass.count({ where }),
  ])
  return paginated(items.map(c => ({
    ...c,
    sections: c.sections.map(sec => ({
      ...sec,
      formTeacher: sec.formTeacher
        ? { id: sec.formTeacher.id, fullName: `${sec.formTeacher.firstName} ${sec.formTeacher.lastName}`, staffCode: sec.formTeacher.staffCode }
        : null,
    })),
  })), total, q)
})

export const POST = createHandler({ permission: 'academic.write', body: classCreateSchema }, async ({ user, body, audit }) => {
  const name = body.name.trim()
  if (await db.schoolClass.findFirst({ where: { schoolId: user.schoolId, name } })) {
    throw conflict(`Class "${name}" already exists`)
  }
  const created = await db.schoolClass.create({ data: {
    schoolId: user.schoolId, name, level: body.level,
    category: body.category ?? null,
  } })
  audit({ action: 'CREATE', entity: 'SchoolClass', entityId: created.id, summary: `Created class ${name} (level ${body.level})` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
