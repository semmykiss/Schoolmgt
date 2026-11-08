// Money helpers — amounts are integer kobo everywhere (₦1 = 100 kobo)

export function formatNaira(kobo: number, opts?: { compact?: boolean; signed?: boolean }): string {
  const naira = kobo / 100
  const abs = Math.abs(naira)
  let body: string
  if (opts?.compact && abs >= 1_000_000) body = `₦${(naira / 1_000_000).toFixed(2)}M`
  else if (opts?.compact && abs >= 10_000) body = `₦${Math.round(naira / 1_000)}k`
  else {
    body = new Intl.NumberFormat('en-NG', {
      style: 'currency', currency: 'NGN',
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(naira)
  }
  if (opts?.signed && kobo > 0) body = `+${body}`
  return body
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100)
}

export function koboToNaira(kobo: number): number {
  return kobo / 100
}

/** Parse user money input like "₦12,500" or "12500.50" → kobo */
export function parseMoneyInput(input: string): number {
  const cleaned = input.replace(/[₦,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
