// Shared helpers for the Exams & Grades module UI.

export function gradeTone(grade: string | null | undefined): string {
  if (!grade) return 'text-muted-foreground'
  if (grade.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400 font-semibold'
  if (grade.startsWith('B')) return 'text-teal-600 dark:text-teal-400 font-medium'
  if (grade.startsWith('C')) return 'text-amber-600 dark:text-amber-400'
  if (grade.startsWith('D') || grade.startsWith('E')) return 'text-orange-600 dark:text-orange-400'
  return 'text-destructive font-medium'
}

export function positionTone(position: number | null | undefined, outOf?: number): string {
  if (!position) return 'text-muted-foreground'
  if (position === 1) return 'text-amber-600 dark:text-amber-400 font-bold'
  if (position <= 3) return 'text-emerald-600 dark:text-emerald-400 font-semibold'
  if (outOf && position / outOf > 0.75) return 'text-destructive font-medium'
  return 'font-medium'
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Download rows as CSV (client-side, no backend round trip). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]): void {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
