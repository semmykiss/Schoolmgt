import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict } from '@/lib/api/errors'
import { timetableCopySchema } from '@/lib/validation/timetable'
import { findClash } from '@/lib/domain/timetable'
import { slotInclude, serializeSlot, type SerializedSlot } from '@/lib/api/timetable-shapes'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Copy a class+section's whole timetable (same term) onto another class+section.
 * The target must be empty for that term. Slots are copied when the target
 * class has the same subject assigned; teachers are carried over unless the
 * teacher would be double-booked in the copied result (they are cleared and
 * reported instead).
 */
export const POST = createHandler({ permission: 'timetable.write', body: timetableCopySchema }, async ({ user, body, audit }) => {
  const [sourceClass, targetClass] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: body.fromClassId, schoolId: user.schoolId } }),
    db.schoolClass.findFirst({ where: { id: body.toClassId, schoolId: user.schoolId } }),
  ])
  if (!sourceClass) throw badRequest('Source class not found')
  if (!targetClass) throw badRequest('Target class not found')

  const targetWhere = {
    schoolId: user.schoolId, termId: body.termId, classId: body.toClassId,
    ...(body.toSectionId ? { sectionId: body.toSectionId } : { sectionId: null }),
  }
  const existingTarget = await db.timetableSlot.findMany({ where: targetWhere })
  if (existingTarget.length > 0) {
    throw conflict(`The target already has ${existingTarget.length} slot(s) this term — clear them before copying`)
  }

  const sourceSlots = await db.timetableSlot.findMany({
    where: {
      schoolId: user.schoolId, termId: body.termId, classId: body.fromClassId,
      ...(body.fromSectionId ? { sectionId: body.fromSectionId } : { sectionId: null }),
    },
    include: slotInclude,
    orderBy: [{ day: 'asc' }, { period: { order: 'asc' } }],
  })
  if (sourceSlots.length === 0) throw conflict('The source timetable is empty — nothing to copy')

  // map subjectId → target classSubject (same subject must exist on the target class)
  const targetClassSubjects = await db.classSubject.findMany({
    where: { schoolId: user.schoolId, classId: body.toClassId },
    include: { subject: { select: { id: true, name: true } } },
  })
  const bySubject = new Map(targetClassSubjects.map(cs => [cs.subject.id, cs]))

  // accumulate the copied result to run clash checks (teacher double-booking)
  const planned: (Omit<SerializedSlot, 'id'> & { id?: string })[] = []
  const skipped: string[] = []
  const clearedTeachers: string[] = []

  for (const src of sourceSlots) {
    const flat = serializeSlot(src)
    if (flat.periodIsBreak) continue
    const cs = flat.subjectId ? bySubject.get(flat.subjectId) : undefined
    if (!cs) { skipped.push(flat.subjectName ?? 'Unknown subject'); continue }

    const { id: _ignored, ...withoutId } = flat
    const clash = findClash(
      { termId: body.termId, classId: body.toClassId, sectionId: body.toSectionId ?? null,
        day: flat.day, periodId: flat.periodId, teacherId: flat.teacherId },
      planned,
    )
    const teacherId = clash?.type === 'TEACHER' ? null : flat.teacherId
    if (clash?.type === 'TEACHER' && flat.teacherId) clearedTeachers.push(flat.teacherName ?? 'a teacher')
    planned.push({ ...withoutId, classId: body.toClassId, teacherId })
  }

  await db.timetableSlot.createMany({
    data: planned.map(p => ({
      schoolId: user.schoolId, termId: body.termId,
      classId: body.toClassId, sectionId: body.toSectionId ?? null,
      day: p.day, periodId: p.periodId,
      classSubjectId: p.subjectId ? bySubject.get(p.subjectId)!.id : null,
      teacherId: p.teacherId,
    })),
  })

  audit({
    action: 'CREATE', entity: 'TimetableSlot',
    summary: `Copied ${planned.length} slots from ${sourceClass.name} to ${targetClass.name}` +
      (skipped.length ? ` (${skipped.length} skipped)` : ''),
  })
  return {
    copied: planned.length,
    skipped: skipped.length,
    skippedSubjects: Array.from(new Set(skipped)),
    teachersCleared: clearedTeachers.length,
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
