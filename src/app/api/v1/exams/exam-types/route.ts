import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { examTypeCreateSchema } from '@/lib/validation/exams'

export const GET = createHandler({ permission: 'exams.read' }, async ({ user }) => {
  const items = await db.examType.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { exams: true } } },
  })
  return { items }
})

export const POST = createHandler({ permission: 'exams.write', body: examTypeCreateSchema }, async ({ user, body, audit }) => {
  const exists = await db.examType.findFirst({
    where: { schoolId: user.schoolId, name: body.name },
    select: { id: true },
  })
  if (exists) throw conflict('An exam type with that name already exists')

  const created = await db.examType.create({
    data: { schoolId: user.schoolId, name: body.name, weight: body.weight },
  })
  audit({ action: 'CREATE', entity: 'ExamType', entityId: created.id, summary: `Created exam type "${created.name}" (${created.weight}%)` })
  return created
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
