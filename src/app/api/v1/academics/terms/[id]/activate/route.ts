import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'

/** Set this term (and its session) as the current one — single source of "today's term". */
export const POST = createHandler({ permission: 'academic.sessions.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Term')
  const term = await db.term.findFirst({ where: { id, schoolId: user.schoolId }, include: { session: true } })
  if (!term) throw notFound('Term not found')

  await db.$transaction([
    db.term.updateMany({ where: { schoolId: user.schoolId, isCurrent: true }, data: { isCurrent: false } }),
    db.academicSession.updateMany({ where: { schoolId: user.schoolId, isCurrent: true }, data: { isCurrent: false } }),
    db.academicSession.update({ where: { id: term.sessionId }, data: { isCurrent: true } }),
    db.term.update({ where: { id }, data: { isCurrent: true } }),
  ])

  audit({ action: 'UPDATE', entity: 'Term', entityId: id, summary: `Set ${term.name} (${term.session.name}) as the current term` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
