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

// ── Amount in words (Nigerian payslip convention) ───────────────────────────

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function under1000(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${under1000(n % 100)}` : ''}`
}

/** "15325000" (kobo) → "One Hundred And Fifty-Three Thousand, Two Hundred And Fifty Naira Only" */
export function nairaInWords(kobo: number): string {
  const naira = Math.floor(Math.abs(kobo) / 100)
  const cents = Math.abs(kobo) % 100
  if (naira === 0 && cents === 0) return 'Zero Naira Only'

  const chunk = (n: number): string => {
    if (n === 0) return ''
    if (n < 1000) return under1000(n)
    const units: { value: number; label: string }[] = [
      { value: 1_000_000_000, label: 'billion' },
      { value: 1_000_000, label: 'million' },
      { value: 1_000, label: 'thousand' },
    ]
    for (const u of units) {
      if (n >= u.value) {
        const head = `${chunk(Math.floor(n / u.value))} ${u.label}`
        const rest = n % u.value
        return rest ? `${head}, ${chunk(rest)}` : head
      }
    }
    return ''
  }

  const words: string[] = []
  if (naira > 0) words.push(`${chunk(naira)} naira`)
  if (cents > 0) words.push(`${under1000(cents)} kobo`)
  const joined = words.join(' and ')
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} only`.replace(/ naira only$/, ' naira only')
}
