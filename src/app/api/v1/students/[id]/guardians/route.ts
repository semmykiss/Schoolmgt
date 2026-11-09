import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { linkGuardianSchema } from '@/lib/validation/admissions'

/** Link an existing guardian (by id) or create-and-link a new one. */
export const POST = createHandler({ permission: 'students.write', body: linkGuardianSchema }, async ({ user, params, body, audit }) => {
  const studentId = requireId(params.id, 'Student')
  const student = await db.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } })
  if (!student) throw notFound('Student not found')

  let guardianId = body.guardianId ?? null
  let guardianName = ''

  if (guardianId) {
    const guardian = await db.guardian.findFirst({ where: { id: guardianId, schoolId: user.schoolId } })
    if (!guardian) throw notFound('Guardian not found in this school')
    guardianName = `${guardian.firstName} ${guardian.lastName}`
    if (body.relation !== guardian.relationship) {
      await db.guardian.update({ where: { id: guardianId }, data: { relationship: body.relation } })
    }
  } else if (body.new) {
    const created = await db.guardian.create({ data: {
      schoolId: user.schoolId,
      firstName: body.new.firstName.trim(), lastName: body.new.lastName.trim(),
      relationship: body.new.relation || body.relation,
      phone: body.new.phone.trim(),
      email: body.new.email?.trim() || null,
      occupation: body.new.occupation?.trim() || null,
      address: body.new.address?.trim() || null,
      isPrimary: body.new.isPrimary,
    } })
    guardianId = created.id
    guardianName = `${created.firstName} ${created.lastName}`
  } else {
    throw notFound('Guardian not found')
  }

  if (await db.studentGuardian.findFirst({ where: { studentId, guardianId } })) {
    throw conflict(`${guardianName} is already linked to ${student.firstName}`)
  }

  await db.studentGuardian.create({ data: { studentId, guardianId } })
  audit({ action: 'UPDATE', entity: 'Student', entityId: studentId, summary: `Linked guardian ${guardianName} to ${student.firstName} ${student.lastName}` })
  return { ok: true }
})

/** Unlink a guardian: /api/v1/students/{id}/guardians?guardianId=... */
export const DELETE = createHandler({ permission: 'students.write' }, async ({ user, params, query, audit }) => {
  const studentId = requireId(params.id, 'Student')
  const guardianId = requireId(query.get('guardianId') ?? undefined, 'Guardian')
  const student = await db.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } })
  if (!student) throw notFound('Student not found')

  const link = await db.studentGuardian.findFirst({ where: { studentId, guardianId }, include: { guardian: true } })
  if (!link) throw notFound('That guardian is not linked to this student')

  await db.studentGuardian.delete({ where: { id: link.id } })
  audit({ action: 'UPDATE', entity: 'Student', entityId: studentId, summary: `Unlinked guardian ${link.guardian.firstName} ${link.guardian.lastName} from ${student.firstName}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
