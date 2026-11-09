// Shared labels/helpers for the Academic Setup module

export const TERM_LABEL: Record<string, string> = {
  FIRST: 'First Term', SECOND: 'Second Term', THIRD: 'Third Term',
}

export const CATEGORY_LABEL: Record<string, string> = {
  PRIMARY: 'Primary', JUNIOR_SECONDARY: 'Junior Secondary', SENIOR_SECONDARY: 'Senior Secondary',
}

export const PLAN_TYPE_LABEL: Record<string, string> = {
  SYLLABUS: 'Syllabus', LESSON_PLAN: 'Lesson Plan',
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateRange(a: string | null | undefined, b: string | null | undefined): string {
  if (!a || !b) return '—'
  return `${fmtDate(a)} – ${fmtDate(b)}`
}

export function fullNameOf(e: { firstName: string; lastName: string }): string {
  return `${e.firstName} ${e.lastName}`
}
