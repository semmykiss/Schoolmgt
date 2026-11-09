import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError } from '@/lib/api/errors'
import { cronSecretValid, CRON_SECRET_CONFIGURED } from '@/lib/api/cron-auth'
import { isExportDue, runScheduledExport } from '@/lib/api/scheduled-export-runner'

/**
 * Cron entry point for unattended export cycles.
 *
 *   POST /api/v1/reports/scheduled-exports/tick
 *   x-cron-secret: <CRON_SECRET>
 *
 * Cross-tenant by design (each job carries its own schoolId for report
 * scoping, notifications and audit). Finds every ACTIVE schedule whose
 * frequency window has elapsed since lastRunAt, runs it, and returns a
 * per-job summary. One failing job does not block the batch.
 *
 * Point any external scheduler at this route — see README "Scheduled
 * exports (unattended cron)" — or run the bundled poller
 * (mini-services/report-scheduler) which hits it every minute.
 */
export const POST = createHandler(
  { auth: false, rateLimit: { bucket: 'cron-tick', limit: 20, windowMs: 60_000 } },
  async ({ req }) => {
    if (!CRON_SECRET_CONFIGURED) {
      throw new ApiError(500, 'CRON_SECRET is not configured on the server — add it to .env to enable unattended runs', 'MISCONFIGURED')
    }
    if (!(await cronSecretValid(req))) {
      throw new ApiError(401, 'Invalid or missing x-cron-secret header', 'FORBIDDEN')
    }

    const now = new Date()
    const jobs = await db.scheduledExport.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    })
    const due = jobs.filter(j => isExportDue(j.frequency, j.lastRunAt, now))

    const actor = { id: null, name: 'Scheduler (cron)', ip: null }
    const ran: Awaited<ReturnType<typeof runScheduledExport>>[] = []
    const failed: { id: string; name: string; error: string }[] = []

    for (const job of due) {
      try {
        ran.push(await runScheduledExport(job, actor, { includeCsv: false, trigger: 'cron' }))
      } catch (err) {
        failed.push({ id: job.id, name: job.name, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    return {
      checkedAt: now.toISOString(),
      activeCount: jobs.length,
      dueCount: due.length,
      skipped: jobs.length - due.length,
      ran: ran.map(({ csv: _csv, ...r }) => r),
      failed,
    }
  },
)
