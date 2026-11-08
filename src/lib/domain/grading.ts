// Pure grading & ranking functions for the Exams module.
// No I/O — fully unit-testable. Works with the GradingScale/GradeBand shape
// stored in Prisma (bands sorted by minScore DESC by convention).

export interface GradeBandLike {
  grade: string
  minScore: number
  maxScore: number
  remark: string
  points?: number | null
}

/** Percentage → matching band (bands may come in any order). */
export function bandForPct(pct: number, bands: GradeBandLike[]): GradeBandLike | null {
  for (const b of bands) {
    if (pct >= b.minScore && pct <= b.maxScore) return b
  }
  return null
}

/** Marks + maxMarks → band via percentage. Falls back to null when no band matches. */
export function gradeFor(marks: number, maxMarks: number, bands: GradeBandLike[]): GradeBandLike | null {
  if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0) return null
  return bandForPct(Math.round((marks / maxMarks) * 1000) / 10, bands)
}

/**
 * Standard competition ranking on a numeric score (descending).
 * Ties share the same position; the next distinct score skips ahead.
 *   [80, 72, 72, 65] → [1, 2, 2, 4]
 */
export function rankPositions<T>(items: T[], scoreOf: (item: T) => number): (T & { position: number })[] {
  const sorted = items
    .map((item, idx) => ({ item, idx, score: scoreOf(item) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
  let lastScore: number | null = null
  let lastPosition = 0
  return sorted.map((entry, rank) => {
    const position = entry.score === lastScore ? lastPosition : rank + 1
    if (entry.score !== lastScore) { lastScore = entry.score; lastPosition = position }
    return { ...entry.item, position }
  })
}

/** Suggested form-teacher remark from a class average (Nigerian report-card tone). */
export function remarkForAverage(avg: number): string {
  if (avg >= 75) return 'An outstanding result. Keep it up!'
  if (avg >= 70) return 'A very good performance. Aim even higher.'
  if (avg >= 65) return 'A good result. A little more effort will lift it further.'
  if (avg >= 55) return 'A fair performance. Work harder next term.'
  if (avg >= 45) return 'An average result. More attention to your studies is needed.'
  if (avg >= 40) return 'A weak result. Serious improvement is required.'
  return 'A poor result. Needs close monitoring and support.'
}

/** Principal remark from position & class size. */
export function remarkForPrincipal(position: number, outOf: number): string | null {
  if (outOf === 0) return null
  if (position === 1) return 'Commended performance — first position.'
  if (position <= 3) return 'Commended performance.'
  if (position / outOf <= 0.5) return 'Satisfactory. Room for improvement.'
  return 'Must sit up. Parents should give more support at home.'
}

/** Subject-level pass/fail summary across a broadsheet column. */
export function subjectStats(results: { marksObtained: number; maxMarks: number }[], passMarks: number) {
  let total = 0
  let pass = 0
  for (const r of results) {
    total += r.marksObtained
    if (r.marksObtained >= passMarks) pass++
  }
  const count = results.length || 1
  return {
    count: results.length,
    average: Math.round((total / count) * 100) / 100,
    passRate: Math.round((pass / count) * 100),
  }
}

/** Two half-open [start, end) time ranges overlap? Times are "HH:MM". */
export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}
