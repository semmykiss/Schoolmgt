import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict } from '@/lib/api/errors'
import { slotCreateSchema } from '@/lib/validation/timetable'
import { findClash } from '@/lib/domain/timetable'
import { slotInclude, serializeSlot, slotsForDay, resolveTerm } from '@/lib/api/timetable-shapes'

export const GET = createHandler({ permission: 'timetable.read' }, async ({ user, query }) => {
  const term = await resolveTerm(user.schoolId, query.get('termId'))
  if (!term) return { termId: null, items: [] }

  const where: Record<string, unknown> = { schoolId: user.schoolId, termId: term.id }
  const classId = query.get('classId')
  const sectionId = query.get('sectionId')
  const teacherId = query.get('teacherId')
  const day = query.get('day')
  if (classId) where.classId = classId
  if (sectionId === 'null') where.sectionId = null
  else if (sectionId) where.sectionId = sectionId
  if (teacherId) where.teacherId = teacherId
  if (day !== null && day !== '') where.day = Number(day)

  const slots = await db.timetableSlot.findMany({
    where,
    include: slotInclude,
    orderBy: [{ day: 'asc' }, { period: { order: 'asc' } }],
  })
  return { termId: term.id, items: slots.map(serializeSlot) }
})

export const POST = createHandler({ permission: 'timetable.write', body: slotCreateSchema }, async ({ user, body, audit }) => {
  // ── referential sanity (all scoped to the school) ─────────────────────────
  const term = await db.term.findFirst({ where: { id: body.termId, schoolId: user.schoolId } })
  if (!term) throw badRequest('Selected term does not exist in your school')
  const schoolClass = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
  if (!schoolClass) throw badRequest('Selected class does not exist in your school')
  if (body.sectionId) {
    const section = await db.section.findFirst({ where: { id: body.sectionId, schoolId: user.schoolId, classId: body.classId } })
    if (!section) throw badRequest('Selected section does not belong to that class')
  }
  const period = await db.period.findFirst({ where: { id: body.periodId, schoolId: user.schoolId } })
  if (!period) throw badRequest('Selected period does not exist in your school')
  if (period.isBreak) throw badRequest('Breaks cannot be scheduled — pick a teaching period')
  if (body.classSubjectId) {
    const cs = await db.classSubject.findFirst({ where: { id: body.classSubjectId, schoolId: user.schoolId, classId: body.classId } })
    if (!cs) throw badRequest('The subject is not assigned to this class')
  }
  if (body.teacherId) {
    const emp = await db.employee.findFirst({ where: { id: body.teacherId, schoolId: user.schoolId } })
    if (!emp) throw badRequest('Selected teacher is not on your staff list')
  }

  // ── clash detection ────────────────────────────────────────────────────────
  const daySlots = await slotsForDay(user.schoolId, body.termId, body.day)
  const clash = findClash(
    {
      termId: body.termId, classId: body.classId,
      sectionId: body.sectionId ?? null, day: body.day, periodId: body.periodId,
      teacherId: body.teacherId ?? null,
    },
    daySlots.map(s => serializeSlot(s)),
  )
  if (clash) {
    throw conflict(
      clash.type === 'CLASS'
        ? `${schoolClass.name} already has a lesson at ${period.name} on ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][body.day]}`
        : `${clash.where} already occupies ${period.name} on ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][body.day]}`,
      { type: clash.type },
    )
  }

  const created = await db.timetableSlot.create({ data: {
    schoolId: user.schoolId,
    termId: body.termId,
    classId: body.classId,
    sectionId: body.sectionId ?? null,
    day: body.day,
    periodId: body.periodId,
    classSubjectId: body.classSubjectId ?? null,
    teacherId: body.teacherId ?? null,
  } })
  audit({ action: 'CREATE', entity: 'TimetableSlot', entityId: created.id,
    summary: `Scheduled ${schoolClass.name} — ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][body.day]} ${period.name}` })
  return { id: created.id }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
