import { createHash, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Shared-secret auth for unattended cron callers.
 *
 * The scheduler (system crontab, k8s CronJob, or the bundled
 * mini-services/report-scheduler poller) sends:
 *   x-cron-secret: <CRON_SECRET>
 *
 * Sessions are unaffected — routes that opt into cron auth still accept a
 * signed-in user; the secret is an additional machine identity.
 */
export const CRON_SECRET_CONFIGURED = Boolean(process.env.CRON_SECRET)

/** Timing-safe comparison of the request's x-cron-secret against CRON_SECRET. */
export async function cronSecretValid(req: NextRequest): Promise<boolean> {
  const provided = req.headers.get('x-cron-secret')
  const expected = process.env.CRON_SECRET
  if (!provided || !expected) return false
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
