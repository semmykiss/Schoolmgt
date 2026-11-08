// Shared query shapes for timetable endpoints (slots / grid / copy).
import { db } from '@/lib/db'
import { conflict } from '@/lib/api/errors'

export const slotInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  period: { select: { id: true, name: true, startTime: true, endTime: true, isBreak: true, order: true } },
  classSubject: { select: { id: true, subject: { select: { id: true, name: true, code: true } } } },
  teacher: { select: { id: true, firstName: true, lastName: true, staffCode: true } },
} as const

export type SlotRow = {
  id: string
  termId: string
  classId: string
  sectionId: string | null
  day: number
  periodId: string
  classSubjectId: string | null
  teacherId: string | null
} & {
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  period: { id: string; name: string; startTime: string; endTime: string; isBreak: boolean; order: number } | null
  classSubject: { id: string; subject: { id: string; name: string; code: string | null } } | null
  teacher: { id: string; firstName: string; lastName: string; staffCode: string } | null
}

/** Flatten a raw Prisma slot into the wire shape the grid consumes. */
export function serializeSlot(s: SlotRow) {
  return {
    id: s.id,
    termId: s.termId,
    classId: s.classId,
    className: s.class?.name ?? null,
    sectionId: s.sectionId,
    sectionName: s.section?.name ?? null,
    day: s.day,
    periodId: s.periodId,
    periodName: s.period?.name ?? null,
    periodOrder: s.period?.order ?? 0,
    periodIsBreak: s.period?.isBreak ?? false,
    classSubjectId: s.classSubjectId,
    subjectId: s.classSubject?.subject.id ?? null,
    subjectName: s.classSubject?.subject.name ?? null,
    subjectCode: s.classSubject?.subject.code ?? null,
    teacherId: s.teacherId,
    teacherName: s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : null,
    teacherStaffCode: s.teacher?.staffCode ?? null,
  }
}
export type SerializedSlot = ReturnType<typeof serializeSlot>

/** All slots for one term+day with the names clash messages need. */
export async function slotsForDay(schoolId: string, termId: string, day: number) {
  return db.timetableSlot.findMany({
    where: { schoolId, termId, day, period: { isBreak: false } },
    include: slotInclude,
  })
}

/**
 * Resolve the term for a timetable query: explicit ?termId=… (validated) or
 * the school's current term. Returns null when the school has no current term.
 */
export async function resolveTerm(schoolId: string, termId: string | null) {
  if (termId) {
    const term = await db.term.findFirst({ where: { id: termId, schoolId } })
    if (!term) throw conflict('Selected term does not exist in your school')
    return term
  }
  return db.term.findFirst({ where: { schoolId, isCurrent: true } })
}
