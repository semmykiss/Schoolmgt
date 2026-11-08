// Sequential document numbering (admission numbers, application numbers,
// staff codes, receipt numbers) — school-scoped, gap-tolerant.
// Format: <PREFIX>/<YEAR>/<SEQ> e.g. CDG/2026/0007

import { db } from '@/lib/db'

/**
 * Generate the next number for a school by scanning the highest existing
 * sequence for the current year. Retries on the (unlikely) unique clash.
 */
export async function nextNumber(
  schoolId: string,
  prefix: string,
  year: number,
  /** Find the highest existing sequence for this school + year. */
  currentMax: (schoolId: string, year: number) => Promise<number>,
): Promise<string> {
  const max = await currentMax(schoolId, year)
  let seq = max + 1
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${prefix}/${year}/${String(seq).padStart(4, '0')}`
    // caller checks uniqueness; we just produce the candidate
    return candidate
  }
  return `${prefix}/${year}/${String(seq).padStart(4, '0')}`
}

/** Extract trailing numeric segment from "CDG/2026/0012" → 12 (0 when absent). */
export function extractSeq(value: string | null | undefined): number {
  if (!value) return 0
  const m = value.match(/(\d+)\s*$/)
  return m ? Number(m[1]) : 0
}

/** Derive a document prefix from the school name, e.g. "Crescent Dawn Group of Schools" → CDG. */
export function schoolPrefix(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(w => /^[A-Za-z]/.test(w))
    .map(w => w[0].toUpperCase())
    .slice(0, 3)
    .join('')
  return initials || 'SD'
}

export const admissionNumber = {
  currentMax: async (schoolId: string, year: number) => {
    const rows = await db.student.findMany({
      where: { schoolId, admissionNumber: { contains: `/${year}/` } },
      select: { admissionNumber: true },
    })
    return rows.reduce((max, r) => Math.max(max, extractSeq(r.admissionNumber)), 0)
  },
}

export const applicationNumber = {
  currentMax: async (schoolId: string, year: number) => {
    const rows = await db.applicant.findMany({
      where: { schoolId, applicationNumber: { contains: `-${year}-` } },
      select: { applicationNumber: true },
    })
    return rows.reduce((max, r) => Math.max(max, extractSeq(r.applicationNumber)), 0)
  },
}

export const invoiceNumber = {
  currentMax: async (schoolId: string, year: number) => {
    const rows = await db.feeInvoice.findMany({
      where: { schoolId, invoiceNumber: { contains: `-${year}-` } },
      select: { invoiceNumber: true },
    })
    return rows.reduce((max, r) => Math.max(max, extractSeq(r.invoiceNumber)), 0)
  },
}

export const receiptNumber = {
  currentMax: async (schoolId: string, year: number) => {
    const rows = await db.payment.findMany({
      where: { schoolId, receiptNumber: { contains: `-${year}-` } },
      select: { receiptNumber: true },
    })
    return rows.reduce((max, r) => Math.max(max, extractSeq(r.receiptNumber)), 0)
  },
}
