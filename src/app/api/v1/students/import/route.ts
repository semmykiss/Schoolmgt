import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, notFound } from '@/lib/api/errors'
import { studentImportSchema } from '@/lib/validation/admissions'
import { admissionNumber, schoolPrefix } from '@/lib/domain/numbering'

/**
 * Bulk CSV import. Rows may include a className to auto-place students and
 * guardian name/phone to create+link a guardian. Returns a per-row report.
 */
export const POST = createHandler({ permission: 'students.write', body: studentImportSchema }, async ({ user, body, audit }) => {
  const classes = await db.schoolClass.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true } })
  const byName = new Map(classes.map(c => [c.name.toLowerCase(), c]))

  const school = await db.school.findUnique({ where: { id: user.schoolId }, select: { name: true } })
  const prefix = schoolPrefix(school?.name ?? 'SchoolDesk')
  const year = new Date().getFullYear()
  let seq = await admissionNumber.currentMax(user.schoolId, year)

  const results: { row: number; status: 'CREATED' | 'FAILED'; admissionNumber?: string; message?: string }[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [index, row] of body.rows.entries()) {
    try {
      const cls = row.className ? byName.get(row.className.toLowerCase()) : undefined
      if (row.className && !cls) {
        results.push({ row: index + 1, status: 'FAILED', message: `Unknown class "${row.className}"` })
        continue
      }
      seq += 1
      const admissionNumberStr = `${prefix}/${year}/${String(seq).padStart(4, '0')}`

      const student = await db.student.create({ data: {
        schoolId: user.schoolId,
        admissionNumber: admissionNumberStr,
        firstName: row.firstName.trim(), lastName: row.lastName.trim(),
        otherName: row.otherName?.trim() || null,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth?.trim() || null,
        classId: cls?.id ?? null,
        admissionDate: row.admissionDate?.trim() || today,
        status: 'ACTIVE',
      } })

      if (row.guardianName?.trim() && row.guardianPhone?.trim()) {
        const [lastName, ...rest] = row.guardianName.trim().split(/\s+/)
        const firstName = rest.join(' ') || lastName
        const guardian = await db.guardian.create({ data: {
          schoolId: user.schoolId,
          firstName, lastName,
          relationship: 'GUARDIAN', phone: row.guardianPhone.trim(),
          isPrimary: true,
        } })
        await db.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id } })
      }

      results.push({ row: index + 1, status: 'CREATED', admissionNumber: admissionNumberStr })
    } catch (err) {
      results.push({ row: index + 1, status: 'FAILED', message: err instanceof Error ? err.message.slice(0, 120) : 'Insert failed' })
    }
  }

  const created = results.filter(r => r.status === 'CREATED').length
  audit({ action: 'CREATE', entity: 'Student', summary: `CSV import: ${created} student(s) created, ${results.length - created} failed` })
  return { results, created, failed: results.length - created }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
