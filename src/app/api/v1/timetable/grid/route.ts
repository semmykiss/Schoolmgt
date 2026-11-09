import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { slotInclude, serializeSlot, resolveTerm } from '@/lib/api/timetable-shapes'

/**
 * One-shot payload for the timetable grid editor:
 *   ?classId=&sectionId=  [&termId=]  (termId omitted → current term)
 * Returns the term, periods, this class's slots, every slot in the term
 * (for client-side teacher-clash prechecks), the class's subject→teacher
 * assignments, and the staff picker list.
 */
export const GET = createHandler({ permission: 'timetable.read' }, async ({ user, query }) => {
  const classId = query.get('classId')
  if (!classId) return { term: null, periods: [], slots: [], allSlots: [], classSubjects: [], teachers: [] }

  const [schoolClass, term] = await Promise.all([
    db.schoolClass.findFirst({ where: { id: classId, schoolId: user.schoolId } }),
    resolveTerm(user.schoolId, query.get('termId')),
  ])
  if (!schoolClass) return { term: null, periods: [], slots: [], allSlots: [], classSubjects: [], teachers: [] }
  if (!term) return { term: null, periods: [], slots: [], allSlots: [], classSubjects: [], teachers: [] }

  const sectionId = query.get('sectionId')

  const [periods, slots, allSlots, classSubjects, teachers] = await Promise.all([
    db.period.findMany({ where: { schoolId: user.schoolId }, orderBy: { order: 'asc' } }),
    db.timetableSlot.findMany({
      where: {
        schoolId: user.schoolId, termId: term.id, classId,
        ...(sectionId ? { sectionId } : {}),
      },
      include: slotInclude,
      orderBy: [{ day: 'asc' }, { period: { order: 'asc' } }],
    }),
    db.timetableSlot.findMany({
      where: { schoolId: user.schoolId, termId: term.id, period: { isBreak: false } },
      include: slotInclude,
      orderBy: [{ day: 'asc' }, { period: { order: 'asc' } }],
    }),
    db.classSubject.findMany({
      where: { schoolId: user.schoolId, classId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, staffCode: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    }),
    db.employee.findMany({
      where: { schoolId: user.schoolId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, staffCode: true },
      orderBy: { firstName: 'asc' },
    }),
  ])

  return {
    term: { id: term.id, name: term.name, isCurrent: term.isCurrent, sessionName: term.sessionId },
    periods,
    slots: slots.map(serializeSlot),
    allSlots: allSlots.map(serializeSlot),
    classSubjects: classSubjects.map(cs => ({
      id: cs.id,
      subjectId: cs.subject.id,
      subjectName: cs.subject.name,
      subjectCode: cs.subject.code,
      defaultTeacherId: cs.teacherId,
      defaultTeacherName: cs.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName}` : null,
    })),
    teachers: teachers.map(t => ({ id: t.id, name: `${t.firstName} ${t.lastName}`, staffCode: t.staffCode })),
  }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
