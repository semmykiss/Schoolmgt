import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { slotUpdateSchema } from '@/lib/validation/timetable'
import { findClash } from '@/lib/domain/timetable'
import { slotInclude, serializeSlot, slotsForDay } from '@/lib/api/timetable-shapes'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const PATCH = createHandler({ permission: 'timetable.write', body: slotUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Timetable slot')
  const slot = await db.timetableSlot.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!slot) throw notFound('Timetable slot not found')

  const next = {
    termId: slot.termId,
    classId: body.classId ?? slot.classId,
    sectionId: body.sectionId === undefined ? slot.sectionId : body.sectionId,
    day: body.day ?? slot.day,
    periodId: body.periodId ?? slot.periodId,
    classSubjectId: body.classSubjectId === undefined ? slot.classSubjectId : body.classSubjectId,
    teacherId: body.teacherId === undefined ? slot.teacherId : body.teacherId,
  }

  // referential sanity for anything that changed
  const schoolClass = await db.schoolClass.findFirst({ where: { id: next.classId, schoolId: user.schoolId } })
  if (!schoolClass) throw badRequest('Selected class does not exist in your school')
  if (next.sectionId) {
    const section = await db.section.findFirst({ where: { id: next.sectionId, schoolId: user.schoolId, classId: next.classId } })
    if (!section) throw badRequest('Selected section does not belong to that class')
  }
  const period = await db.period.findFirst({ where: { id: next.periodId, schoolId: user.schoolId } })
  if (!period) throw badRequest('Selected period does not exist in your school')
  if (period.isBreak) throw badRequest('Breaks cannot be scheduled — pick a teaching period')
  if (next.classSubjectId) {
    const cs = await db.classSubject.findFirst({ where: { id: next.classSubjectId, schoolId: user.schoolId, classId: next.classId } })
    if (!cs) throw badRequest('The subject is not assigned to this class')
  }
  if (next.teacherId) {
    const emp = await db.employee.findFirst({ where: { id: next.teacherId, schoolId: user.schoolId } })
    if (!emp) throw badRequest('Selected teacher is not on your staff list')
  }

  const daySlots = await slotsForDay(user.schoolId, next.termId, next.day)
  const clash = findClash(next, daySlots.map(s => serializeSlot(s)), id)
  if (clash) {
    throw conflict(
      clash.type === 'CLASS'
        ? `${schoolClass.name} already has a lesson at ${period.name} on ${DAY_NAMES[next.day]}`
        : `${clash.where} already occupies ${period.name} on ${DAY_NAMES[next.day]}`,
      { type: clash.type },
    )
  }

  await db.timetableSlot.update({
    where: { id },
    data: {
      classId: next.classId, sectionId: next.sectionId, day: next.day,
      periodId: next.periodId, classSubjectId: next.classSubjectId, teacherId: next.teacherId,
    },
  })
  audit({ action: 'UPDATE', entity: 'TimetableSlot', entityId: id,
    summary: `Moved slot to ${schoolClass.name} — ${DAY_NAMES[next.day]} ${period.name}` })
  return { id }
})

export const DELETE = createHandler({ permission: 'timetable.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Timetable slot')
  const slot = await db.timetableSlot.findFirst({ where: { id, schoolId: user.schoolId }, include: slotInclude })
  if (!slot) throw notFound('Timetable slot not found')
  await db.timetableSlot.delete({ where: { id } })
  const s = serializeSlot(slot)
  audit({ action: 'DELETE', entity: 'TimetableSlot', entityId: id,
    summary: `Cleared ${s.className ?? 'class'} — ${DAY_NAMES[s.day]} ${s.periodName ?? ''}`.trim() })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
