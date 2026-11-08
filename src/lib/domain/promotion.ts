// Promotion planning — pure domain logic (no db / no IO), so the rules are
// easy to reason about and test. The API layer supplies data and persists
// the plan this module produces.

export interface PromoStudent {
  id: string
  fullName: string
  admissionNumber: string
  classId: string | null
  classLevel: number | null
  status: string
}

export interface PromoClass {
  id: string
  name: string
  level: number
}

export type PromotionAction = 'PROMOTE' | 'HOLD_BACK' | 'GRADUATE'

export interface PlannedStudent extends PromoStudent {
  /** Suggested action for this student. */
  action: PromotionAction
  /** Target class for PROMOTE (level+1). Null when no next class exists. */
  suggestedClassId: string | null
  suggestedClassName: string | null
  /** True when the student is in the final class (no higher level exists). */
  isFinalLevel: boolean
  note: string
}

export interface PromotionPlanResult {
  plan: PlannedStudent[]
  /** Classes available as promotion targets, sorted by level. */
  targetClasses: PromoClass[]
  warnings: string[]
}

/**
 * Build the default promotion plan for students of one class:
 *  - ACTIVE students  → next class by level (level + 1)
 *  - No next class    → GRADUATE (top-of-school, e.g. SS 3)
 *  - Non-ACTIVE (graduated/transferred/left) → excluded from the run
 */
export function planPromotions(
  students: PromoStudent[],
  allClasses: PromoClass[],
): PromotionPlanResult {
  const classes = [...allClasses].sort((a, b) => a.level - b.level)
  const levels = classes.map(c => c.level)
  const maxLevel = levels.length ? Math.max(...levels) : 0

  const nextClassFor = (level: number): PromoClass | null =>
    classes.find(c => c.level === level + 1) ?? null

  const warnings: string[] = []
  const plan: PlannedStudent[] = []

  for (const s of students) {
    if (s.status !== 'ACTIVE') {
      warnings.push(`${s.fullName} (${s.admissionNumber}) is ${s.status.toLowerCase()} and was excluded`)
      continue
    }
    if (s.classLevel == null) {
      plan.push({
        ...s, action: 'HOLD_BACK', suggestedClassId: null, suggestedClassName: null,
        isFinalLevel: false, note: 'Not assigned to a class — fix the profile first',
      })
      warnings.push(`${s.fullName} (${s.admissionNumber}) has no class assigned`)
      continue
    }
    if (s.classLevel >= maxLevel) {
      plan.push({
        ...s, action: 'GRADUATE', suggestedClassId: null, suggestedClassName: null,
        isFinalLevel: true, note: 'Final class — graduating',
      })
      continue
    }
    const next = nextClassFor(s.classLevel)
    if (!next) {
      plan.push({
        ...s, action: 'HOLD_BACK', suggestedClassId: null, suggestedClassName: null,
        isFinalLevel: false, note: `No class exists at level ${s.classLevel + 1} — create it first`,
      })
      warnings.push(`No class at level ${s.classLevel + 1} — create the next class before promoting`)
      continue
    }
    plan.push({
      ...s, action: 'PROMOTE', suggestedClassId: next.id, suggestedClassName: next.name,
      isFinalLevel: false, note: `Move to ${next.name}`,
    })
  }

  return { plan, targetClasses: classes, warnings: Array.from(new Set(warnings)) }
}

export interface PromotionEntry {
  studentId: string
  action: PromotionAction
  toClassId?: string | null
  toSectionId?: string | null
}

export interface PromotionEntryError {
  studentId: string
  message: string
}

/** Validate a user-edited plan before persisting it. */
export function validatePromotionEntries(
  entries: PromotionEntry[],
  plan: PlannedStudent[],
): PromotionEntryError[] {
  const byId = new Map(plan.map(p => [p.id, p]))
  const errors: PromotionEntryError[] = []
  for (const e of entries) {
    const p = byId.get(e.studentId)
    if (!p) {
      errors.push({ studentId: e.studentId, message: 'Student is not part of this promotion run' })
      continue
    }
    if (e.action === 'PROMOTE' && !e.toClassId) {
      errors.push({ studentId: e.studentId, message: 'Choose a target class for promoted students' })
    }
    if (e.action === 'HOLD_BACK' && p.note === 'Not assigned to a class — fix the profile first') {
      errors.push({ studentId: e.studentId, message: p.note })
    }
  }
  return errors
}
