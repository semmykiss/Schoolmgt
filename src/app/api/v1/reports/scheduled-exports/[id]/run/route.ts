import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { ApiError, notFound, badRequest } from '@/lib/api/errors'
import { getAuthUser } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { cronSecretValid } from '@/lib/api/cron-auth'
import { runScheduledExport } from '@/lib/api/scheduled-export-runner'

/**
 * Run a scheduled export now. Two accepted identities:
 *
 *  1. Signed-in user with `reports.write` (the UI "Run now" button) —
 *     scoped to the user's school, CSV returned for download.
 *  2. Unattended cron caller with `x-cron-secret: <CRON_SECRET>` — the
 *     exact pattern for pointing a crontab at a single schedule:
 *       curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *         https://<host>/api/v1/reports/scheduled-exports/<id>/run
 *     (For all-schedules-at-once, prefer /scheduled-exports/tick.)
 */
export const POST = createHandler({ auth: false }, async ({ req, params }) => {
  const cronOk = await cronSecretValid(req)
  const user = await getAuthUser(req)
  if (!user && !cronOk) throw new ApiError(401, 'Please sign in to continue')
  if (user && !can(user.permissions, 'reports.write')) {
    throw new ApiError(403, 'Missing permission: reports.write', 'FORBIDDEN')
  }

  const job = await db.scheduledExport.findFirst({
    where: { id: params.id, ...(user ? { schoolId: user.schoolId } : {}) },
  })
  if (!job) throw notFound('Scheduled export not found')
  if (!job.active) throw badRequest('This schedule is paused — activate it before running')

  return runScheduledExport(
    job,
    { id: user?.id ?? null, name: user?.fullName ?? 'Scheduler (cron)' },
    { includeCsv: true, trigger: user ? 'manual' : 'cron' },
  )
})
