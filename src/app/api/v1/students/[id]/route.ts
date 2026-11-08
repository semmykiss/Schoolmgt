import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { studentUpdateSchema } from '@/lib/validation/admissions'

export const GET = createHandler({ permission: 'students.read' }, async ({ user, params }) => {
  const id = requireId(params.id, 'Student')
  const student = await db.student.findFirst({
    where: { id, schoolId: user.schoolId },
    include: {
      class: { select: { id: true, name: true, level: true } },
      section: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  })
  if (!student) throw notFound('Student not found')

  const links = await db.studentGuardian.findMany({
    where: { studentId: id },
    include: { guardian: true },
  })

  // Siblings: other students sharing any of this student's guardians
  const guardianIds = links.map(l => l.guardianId)
  const siblingLinks = guardianIds.length
    ? await db.studentGuardian.findMany({
        where: { guardianId: { in: guardianIds }, studentId: { not: id } },
        include: { student: { include: { class: { select: { name: true } }, section: { select: { name: true } } } }, guardian: { select: { firstName: true, lastName: true } } },
      })
    : []

  const [attendanceCount, invoiceAgg] = await Promise.all([
    db.studentAttendance.count({ where: { studentId: id, status: 'ABSENT' } }),
    db.feeInvoice.aggregate({ where: { studentId: id }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
  ])

  const siblingsById = new Map<string, { id: string; fullName: string; admissionNumber: string; className: string | null; guardians: string[] }>()
  for (const l of siblingLinks) {
    const s = siblingsById.get(l.student.id) ?? {
      id: l.student.id,
      fullName: [l.student.lastName, l.student.firstName, l.student.otherName].filter(Boolean).join(' '),
      admissionNumber: l.student.admissionNumber,
      className: l.student.class ? `${l.student.class.name}${l.student.section ? ` ${l.student.section.name}` : ''}` : null,
      guardians: [],
    }
    s.guardians.push(`${l.guardian.firstName} ${l.guardian.lastName}`)
    siblingsById.set(l.student.id, s)
  }

  return {
    ...student,
    guardians: links.map(l => ({ ...l.guardian })),
    siblings: [...siblingsById.values()],
    summary: {
      absences: attendanceCount,
      invoices: invoiceAgg._count._all,
      billedKobo: invoiceAgg._sum.total ?? 0,
      paidKobo: invoiceAgg._sum.amountPaid ?? 0,
    },
  }
})

export const PATCH = createHandler({ permission: 'students.write', body: studentUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Student')
  const student = await db.student.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!student) throw notFound('Student not found')

  if (body.classId) {
    const cls = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
    if (!cls) throw notFound('Selected class does not exist')
    if (body.sectionId) {
      const section = await db.section.findFirst({ where: { id: body.sectionId, classId: body.classId, schoolId: user.schoolId } })
      if (!section) throw badRequest('Selected section does not belong to that class')
    }
  }
  if (body.status && body.status !== student.status && student.status !== 'ACTIVE') {
    throw conflict(`Only active students can change status — ${student.firstName} is ${student.status.toLowerCase()}`)
  }

  const updated = await db.student.update({
    where: { id },
    data: {
      ...(body.firstName !== undefined ? { firstName: body.firstName.trim() } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName.trim() } : {}),
      ...(body.otherName !== undefined ? { otherName: body.otherName?.trim() || null } : {}),
      ...(body.gender !== undefined ? { gender: body.gender } : {}),
      ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth ?? null } : {}),
      ...(body.classId !== undefined ? { classId: body.classId ?? null, sectionId: body.classId ? (body.sectionId ?? student.sectionId) : null } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId ?? null } : {}),
      ...(body.admissionDate !== undefined ? { admissionDate: body.admissionDate } : {}),
      ...(body.address !== undefined ? { address: body.address?.trim() || null } : {}),
      ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup?.trim() || null } : {}),
      ...(body.medicalNotes !== undefined ? { medicalNotes: body.medicalNotes?.trim() || null } : {}),
      ...(body.branchId !== undefined ? { branchId: body.branchId ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'Student', entityId: id, summary: `Updated profile of ${updated.firstName} ${updated.lastName}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'students.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Student')
  const student = await db.student.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!student) throw notFound('Student not found')

  const [invoices, results] = await Promise.all([
    db.feeInvoice.count({ where: { studentId: id } }),
    db.examResult.count({ where: { studentId: id } }),
  ])
  if (invoices > 0 || results > 0) {
    throw conflict(`${student.firstName} has financial/academic records (${invoices} invoice(s), ${results} result(s)). Use "Exit school" instead of deleting`)
  }

  await db.student.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Student', entityId: id, summary: `Deleted student ${student.firstName} ${student.lastName}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
