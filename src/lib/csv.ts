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

/** Minimal RFC-4180-ish CSV parser for imports (handles quotes and commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell); cell = ''
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}
