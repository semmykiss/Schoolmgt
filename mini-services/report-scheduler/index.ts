/**
 * SchoolDesk report-scheduler — unattended cron poller.
 *
 * Every INTERVAL_MS it POSTs the Next.js tick endpoint, which runs all
 * due scheduled report exports (DAILY/WEEKLY/MONTHLY calendar windows):
 *
 *   POST {TARGET_URL}/api/v1/reports/scheduled-exports/tick
 *   x-cron-secret: {CRON_SECRET}
 *
 * Also exposes a tiny health/ops API on :3070
 *   GET  /health  → last tick result, run/fail counters
 *   POST /tick    → trigger an out-of-band tick immediately
 *
 * In production you can skip this process entirely and use a system
 * crontab / k8s CronJob against the same endpoint — see README
 * "Scheduled exports (unattended cron)".
 */

const PORT = Number(process.env.PORT || 3070)
const TARGET_URL = process.env.TARGET_URL || 'http://127.0.0.1:3000'
const CRON_SECRET = process.env.CRON_SECRET || ''
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 60_000)
const TICK_PATH = '/api/v1/reports/scheduled-exports/tick'

let lastRun: string | null = null
let lastStatus: number | null = null
let lastBody: unknown = null
let lastError: string | null = null
let runCount = 0
let failCount = 0
let inFlight = false

async function tick(): Promise<void> {
  if (inFlight) return // never overlap — a slow report must not stack up
  inFlight = true
  lastRun = new Date().toISOString()
  try {
    const res = await fetch(`${TARGET_URL}${TICK_PATH}`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    lastStatus = res.status
    lastBody = await res.json().catch(() => null)
    lastError = null
    if (res.ok) {
      runCount++
      const d = (lastBody as { data?: { ran?: unknown[]; failed?: unknown[]; skipped?: number } })?.data
      console.log(
        `[scheduler] ${lastRun} tick ok — ran=${d?.ran?.length ?? '?'} failed=${d?.failed?.length ?? 0} skipped=${d?.skipped ?? '?'}`,
      )
    } else {
      failCount++
      console.error(`[scheduler] ${lastRun} tick rejected: HTTP ${res.status}`)
    }
  } catch (err) {
    failCount++
    lastStatus = null
    lastBody = null
    lastError = err instanceof Error ? err.message : String(err)
    console.error(`[scheduler] ${lastRun} tick error:`, lastError)
  } finally {
    inFlight = false
  }
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname === '/health') {
      // Healthy = the LAST tick succeeded (transient failures while the app
      // restarts are normal; only a persistently failing last tick is down).
      const healthy = lastRun !== null && lastStatus === 200 && lastError === null
      return Response.json(
        {
          ok: healthy,
          target: TARGET_URL,
          tickPath: TICK_PATH,
          intervalMs: INTERVAL_MS,
          lastRun,
          lastStatus,
          lastError,
          lastBody,
          runCount,
          failCount,
          secretConfigured: CRON_SECRET.length > 0,
        },
        { status: healthy ? 200 : 503 },
      )
    }
    if (pathname === '/tick' && req.method === 'POST') {
      void tick()
      return Response.json({ ok: true, triggered: true })
    }
    return new Response('schooldesk report-scheduler — GET /health, POST /tick', { status: 404 })
  },
})

// First tick after the Next.js server has had a moment to warm up, then steady cadence.
setTimeout(() => void tick(), 8_000)
setInterval(() => void tick(), INTERVAL_MS)

console.log(`[scheduler] every ${INTERVAL_MS}ms → ${TARGET_URL}${TICK_PATH} (health on :${PORT}/health, secret ${CRON_SECRET ? 'configured' : 'MISSING'})`)
