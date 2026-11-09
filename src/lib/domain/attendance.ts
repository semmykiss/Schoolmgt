// Pure attendance logic + shared labels — safe on client and server.

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const STAFF_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'ON_LEAVE'] as const
export type StaffStatus = (typeof STAFF_STATUSES)[number]

/** Chip/variant styling per status — used by register UI and summaries. */
export const STATUS_STYLES: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ABSENT: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  LATE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  EXCUSED: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  ON_LEAVE: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

export const STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused', ON_LEAVE: 'On leave',
}

export interface AttendanceRecordLike {
  studentId: string
  status: string
}

export interface StudentAttendanceSummary {
  studentId: string
  PRESENT: number
  ABSENT: number
  LATE: number
  EXCUSED: number
  total: number
  /** % of marked days where the student was in school (present or late). */
  rate: number
}

/**
 * Pivot flat records into per-student summaries.
 * Rate = (PRESENT + LATE) / total — late students did attend school.
 */
export function summarizeStudentAttendance(records: AttendanceRecordLike[]): StudentAttendanceSummary[] {
  const byStudent = new Map<string, StudentAttendanceSummary>()
  for (const r of records) {
    let s = byStudent.get(r.studentId)
    if (!s) {
      s = { studentId: r.studentId, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0, rate: 0 }
      byStudent.set(r.studentId, s)
    }
    if (r.status in s) (s as unknown as Record<string, number>)[r.status]++
    s.total++
  }
  for (const s of byStudent.values()) {
    s.rate = s.total === 0 ? 0 : Math.round(((s.PRESENT + s.LATE) / s.total) * 100)
  }
  return Array.from(byStudent.values())
}

/** Today as "YYYY-MM-DD" using local components (TZ-safe). */
export function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Parse "YYYY-MM-DD" → UTC-anchored Date (avoids TZ drift on parse/format). */
function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) // local midnight
  return Number.isNaN(d.getTime()) ? null : d
}

/** Format a Date as "YYYY-MM-DD" using its *local* components (TZ-safe). */
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** All weekdays (Mon–Fri, Sat optional) inside an inclusive YYYY-MM-DD range. */
export function weekdaysInRange(from: string, to: string, includeSaturday = false): string[] {
  const out: string[] = []
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end || end < start) return out
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay() // 0=Sun
    if (day === 0 || (day === 6 && !includeSaturday)) continue
    out.push(fmtDate(d))
  }
  return out
}
