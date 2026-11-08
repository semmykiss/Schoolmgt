// Pure timetable logic — shared by API routes (authoritative) and the UI grid
// (instant feedback before save). No db imports.

export interface SlotKey {
  termId: string
  classId: string
  sectionId?: string | null
  day: number
  periodId: string
  teacherId?: string | null
}

export interface Clash {
  type: 'CLASS' | 'TEACHER'
  /** Human-readable location of the conflicting slot. */
  where: string
  slotId?: string
}

function sectionKey(sectionId: string | null | undefined): string {
  return sectionId ?? '*'
}

/**
 * Detect clashes for a proposed slot against a list of existing slots.
 *  - CLASS  → same class+section already has a lesson at that day+period
 *  - TEACHER→ the teacher is already teaching another class at that day+period
 * (`existing` must exclude break periods — breaks are never scheduled.)
 */
export function findClash(
  proposed: SlotKey,
  existing: (SlotKey & { id?: string; className?: string | null; sectionName?: string | null; teacherName?: string | null })[],
  ignoreSlotId?: string,
): Clash | null {
  const classClash = existing.find(s =>
    s.termId === proposed.termId &&
    s.classId === proposed.classId &&
    sectionKey(s.sectionId) === sectionKey(proposed.sectionId) &&
    s.day === proposed.day &&
    s.periodId === proposed.periodId &&
    s.id !== ignoreSlotId,
  )
  if (classClash) {
    return {
      type: 'CLASS',
      where: `${classClash.className ?? 'the class'}${classClash.sectionName ? ` (${classClash.sectionName})` : ''}`,
      slotId: classClash.id,
    }
  }

  if (!proposed.teacherId) return null
  const teacherClash = existing.find(s =>
    s.termId === proposed.termId &&
    s.teacherId === proposed.teacherId &&
    s.day === proposed.day &&
    s.periodId === proposed.periodId &&
    s.id !== ignoreSlotId &&
    // the same class+section slot being edited is not a clash for its own teacher
    !(s.classId === proposed.classId && sectionKey(s.sectionId) === sectionKey(proposed.sectionId)),
  )
  if (teacherClash) {
    return {
      type: 'TEACHER',
      where: `${teacherClash.teacherName ?? 'another class'}${teacherClash.className ? ` — ${teacherClash.className}` : ''}`,
      slotId: teacherClash.id,
    }
  }
  return null
}

/** Grid helper: index slots by `${day}:${periodId}` for O(1) cell lookups. */
export function indexSlots<T extends { day: number; periodId: string }>(slots: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const s of slots) map.set(`${s.day}:${s.periodId}`, s)
  return map
}
