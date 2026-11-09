import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { buildReportCsv, reportCsvString, REPORT_LABELS } from '@/lib/api/report-data'
import { notifyUsers } from '@/lib/api/notify'

/**
 * Run a scheduled export now: rebuild the report CSV, stamp lastRunAt and
 * notify any recipients who have SchoolDesk accounts (emails without an
 * account are counted and reported back so the school can fix them).
 */
export const POST = createHandler({ permission: 'reports.write' }, async ({ user, params, audit }) => {
  const job = await db.scheduledExport.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!job) throw notFound('Scheduled export not found')
  if (!job.active) throw badRequest('This schedule is paused — activate it before running')

  let filters: Record<string, unknown> = {}
  try { filters = JSON.parse(job.filters) } catch { /* default */ }
  let recipients: string[] = []
  try { recipients = JSON.parse(job.recipients) } catch { /* default */ }

  const file = await buildReportCsv(job.reportKey, user.schoolId, filters)
  const csv = reportCsvString(file)
  const filename = `${file.filename}-${new Date().toISOString().slice(0, 10)}.csv`

  await db.scheduledExport.update({
    where: { id: job.id },
    data: { lastRunAt: new Date() },
  })

  const users = recipients.length
    ? await db.user.findMany({
        where: { schoolId: user.schoolId, email: { in: recipients }, status: 'ACTIVE' },
        select: { id: true, role: true, email: true },
      })
    : []
  const matched = new Set(users.map(u => u.email.toLowerCase()))

  const notified = await notifyUsers(user.schoolId, users, {
    title: `Report ready: ${job.name}`,
    body: `${REPORT_LABELS[job.reportKey] ?? job.reportKey} — ${file.rows.length} row(s) exported as CSV.`,
    type: 'SYSTEM',
    link: '/reports',
  })

  audit({
    action: 'EXPORT',
    entity: 'ScheduledExport',
    entityId: job.id,
    summary: `Ran scheduled export "${job.name}" — ${file.rows.length} rows, ${notified} notified`,
  })

  return {
    filename,
    csv,
    rowCount: file.rows.length,
    notified,
    unmatchedRecipients: recipients.filter(email => !matched.has(email.toLowerCase())),
  }
})
