import { db } from '@/lib/db'
import { buildReportCsv, reportCsvString, REPORT_LABELS } from './report-data'
import { notifyUsers } from './notify'

/**
 * Server-side runner shared by:
 *  - "Run now" (interactive, reports.write session) → includeCsv + audit as user
 *  - POST /api/v1/reports/scheduled-exports/tick (unattended cron) → audit as Scheduler
 *  - POST /api/v1/reports/scheduled-exports/{id}/run with x-cron-secret
 *
 * Each run rebuilds the report CSV for the schedule's school, stamps
 * lastRunAt, notifies recipients with SchoolDesk accounts and writes an
 * EXPORT audit entry.
 */

export interface ExportActor {
  id: string | null
  name: string
  ip?: string | null
}

export interface ExportRunResult {
  id: string
  name: string
  reportKey: string
  schoolId: string
  filename: string
  rowCount: number
  notified: number
  unmatchedRecipients: string[]
  csv?: string
}

function safeParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/** ISO week key like "2025-W23" — stable across timezones (UTC-based). */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Is a schedule due to run at `now`? Calendar-boundary semantics so a
 * delivery maps to a report period (a day / ISO week / month) and never
 * double-fires within the same window, while a missed window catches up
 * exactly once on the next tick.
 */
export function isExportDue(frequency: string, lastRunAt: Date | null, now: Date = new Date()): boolean {
  if (!lastRunAt) return true // never run → deliver the first cycle immediately
  const last = new Date(lastRunAt)
  switch (frequency) {
    case 'DAILY':
      return now.toISOString().slice(0, 10) !== last.toISOString().slice(0, 10)
    case 'WEEKLY':
      return isoWeekKey(now) !== isoWeekKey(last)
    case 'MONTHLY':
      return now.getUTCFullYear() !== last.getUTCFullYear() || now.getUTCMonth() !== last.getUTCMonth()
    default:
      return false // unknown frequency → never auto-run (manual "Run now" still works)
  }
}

/**
 * Execute one scheduled export end-to-end. Throws on failure — callers
 * (tick batch) catch per job so one bad report doesn't block the rest.
 */
export async function runScheduledExport(
  job: {
    id: string
    schoolId: string
    reportKey: string
    name: string
    format: string
    filters: string
    recipients: string
  },
  actor: ExportActor,
  opts: { includeCsv?: boolean; trigger?: 'cron' | 'manual' } = {},
): Promise<ExportRunResult> {
  const { includeCsv = false, trigger = 'manual' } = opts

  const filters = safeParse<Record<string, unknown>>(job.filters, {})
  const recipients = safeParse<string[]>(job.recipients, [])

  const file = await buildReportCsv(job.reportKey, job.schoolId, filters)
  const filename = `${file.filename}-${new Date().toISOString().slice(0, 10)}.csv`

  await db.scheduledExport.update({
    where: { id: job.id },
    data: { lastRunAt: new Date() },
  })

  const users = recipients.length
    ? await db.user.findMany({
        where: { schoolId: job.schoolId, email: { in: recipients }, status: 'ACTIVE' },
        select: { id: true, role: true, email: true },
      })
    : []
  const matched = new Set(users.map(u => u.email.toLowerCase()))

  const notified = await notifyUsers(job.schoolId, users, {
    title: `Report ready: ${job.name}`,
    body: `${REPORT_LABELS[job.reportKey] ?? job.reportKey} — ${file.rows.length} row(s) exported as ${job.format === 'PDF' ? 'CSV (PDF mail-out pending)' : 'CSV'}${trigger === 'cron' ? ' (scheduled run)' : ''}.`,
    type: 'SYSTEM',
    link: '/reports',
  })

  await db.auditLog.createMany({
    data: [{
      schoolId: job.schoolId,
      userId: actor.id,
      userName: actor.name,
      action: 'EXPORT',
      entity: 'ScheduledExport',
      entityId: job.id,
      summary: `Ran scheduled export "${job.name}"${trigger === 'cron' ? ' (cron)' : ''} — ${file.rows.length} row(s), ${notified} notified`,
      ip: actor.ip ?? null,
    }],
  })

  return {
    id: job.id,
    name: job.name,
    reportKey: job.reportKey,
    schoolId: job.schoolId,
    filename,
    rowCount: file.rows.length,
    notified,
    unmatchedRecipients: recipients.filter(email => !matched.has(email.toLowerCase())),
    ...(includeCsv ? { csv: reportCsvString(file) } : {}),
  }
}
