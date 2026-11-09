/**
 * One-off data upgrade (2025-xx): 
 *  1. Backfill breakdown items for DRAFT payslips whose items are empty,
 *     recomputed from each employee's active salary structure.
 *  2. Seed a PARENTS-audience calendar event so the portal events card has
 *     demo data in the existing database.
 * Run: bun run scripts/backfill-payslips.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const structures = await db.salaryStructure.findMany({ where: { isActive: true } })
  const structureOf = new Map<string, (typeof structures)[number]>()
  for (const s of structures) {
    const existing = structureOf.get(s.employeeId)
    if (!existing || s.effectiveFrom > existing.effectiveFrom) structureOf.set(s.employeeId, s)
  }

  const drafts = await db.payslip.findMany({ where: { status: 'DRAFT' } })
  let fixed = 0
  for (const p of drafts) {
    let items: unknown = []
    try { items = JSON.parse(p.items) } catch { /* treat as empty */ }
    if (Array.isArray(items) && items.length > 0) continue
    const s = structureOf.get(p.employeeId)
    if (!s) continue
    const allowances = JSON.parse(s.allowances) as { label: string; amount: number }[]
    const deductions = JSON.parse(s.deductions) as { label: string; amount: number }[]
    const payload = [
      { label: 'Basic Salary', amount: s.basicAmount, type: 'BASIC' },
      ...allowances.map(l => ({ label: l.label, amount: l.amount, type: 'ALLOWANCE' })),
      ...deductions.map(l => ({ label: l.label, amount: l.amount, type: 'DEDUCTION' })),
    ]
    await db.payslip.update({ where: { id: p.id }, data: { items: JSON.stringify(payload) } })
    fixed += 1
  }
  console.log(`✅ Backfilled ${fixed} draft payslip(s) with full breakdowns`)

  const schools = await db.school.findMany({ select: { id: true } })
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const inDays = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n); return iso(d)
  }
  let events = 0
  for (const school of schools) {
    const exists = await db.calendarEvent.findFirst({
      where: { schoolId: school.id, audience: 'PARENTS', startDate: { gte: iso(new Date()) } },
    })
    if (exists) continue
    await db.calendarEvent.create({
      data: {
        schoolId: school.id,
        title: 'PTA Meeting',
        type: 'MEETING',
        startDate: inDays(14),
        endDate: inDays(14),
        audience: 'PARENTS',
      },
    })
    events += 1
  }
  console.log(`✅ Added ${events} PARENTS-audience event(s)`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
