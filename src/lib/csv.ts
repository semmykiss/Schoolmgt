// Client-side CSV export

export interface CsvColumn<T> {
  key: string
  label: string
  value?: (row: T) => string | number | null | undefined
}

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const body = rows.map(r => columns.map(c => escapeCell(c.value ? c.value(r) : r[c.key])).join(',')).join('\n')
  return `${header}\n${body}`
}

export function downloadCsv<T extends Record<string, unknown>>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const blob = new Blob(['\uFEFF' + rowsToCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
