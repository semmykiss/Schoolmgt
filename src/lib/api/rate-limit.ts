// In-memory sliding-window rate limiter (single-node; swap for Redis in prod clusters)

const buckets = new Map<string, number[]>()

export interface RateResult { ok: boolean; retryAfterSec: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(ts => now - ts < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - hits[0])) / 1000) }
  }
  hits.push(now)
  buckets.set(key, hits)
  // opportunistic cleanup
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every(ts => now - ts > windowMs)) buckets.delete(k)
    }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'local'
}
