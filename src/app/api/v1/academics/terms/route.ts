import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { termCreateSchema } from '@/lib/validation/academic'

export const GET = createHandler({ permission: 'academic.read' }, async ({ user, query }) => {
  const sessionId = query.get('sessionId') ?? undefined
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  if (sessionId) where.sessionId = sessionId
  const items = await db.term.findMany({
    where,
    orderBy: { startDate: 'asc' },
    include: { session: { select: { id: true, name: true, isCurrent: true } } },
  })
  return { items }
})

export const POST = createHandler({ permission: 'academic.write', body: termCreateSchema }, async ({ user, body, audit }) => {
  const session = await db.academicSession.findFirst({ where: { id: body.sessionId, schoolId: user.schoolId } })
  if (!session) throw notFound('Session not found')

  if (await db.term.findFirst({ where: { sessionId: body.sessionId, name: body.name } })) {
    throw conflict(`${session.name} already has a ${body.name.charAt(0) + body.name.slice(1).toLowerCase()} term`)
  }

  const created = await db.$transaction(async tx => {
    if (body.setCurrent) {
      await tx.term.updateMany({ where: { schoolId: user.schoolId, isCurrent: true }, data: { isCurrent: false } })
      await tx.academicSession.updateMany({ where: { schoolId: user.schoolId, isCurrent: true, id: { not: body.sessionId } }, data: { isCurrent: false } })
      await tx.academicSession.update({ where: { id: body.sessionId }, data: { isCurrent: true } })
    }
    return tx.term.create({ data: {
      schoolId: user.schoolId, sessionId: body.sessionId, name: body.name,
      startDate: body.startDate, endDate: body.endDate,
      isCurrent: body.setCurrent ?? false,
    } })
  })

  audit({ action: 'CREATE', entity: 'Term', entityId: created.id, summary: `Created ${body.name} term for ${session.name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
