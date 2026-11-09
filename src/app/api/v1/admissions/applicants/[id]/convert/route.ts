import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { applicantConvertSchema } from '@/lib/validation/admissions'
import { admissionNumber, schoolPrefix } from '@/lib/domain/numbering'

/** Convert an applicant (INTERVIEW / WAITLISTED / APPLIED) into an enrolled student. */
export const POST = createHandler({ permission: 'admissions.write', body: applicantConvertSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Applicant')
  const applicant = await db.applicant.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!applicant) throw notFound('Applicant not found')
  const school = await db.school.findUnique({ where: { id: user.schoolId }, select: { name: true } })
  if (applicant.admittedStudentId) throw conflict('This applicant has already been converted to a student')

  const schoolClass = await db.schoolClass.findFirst({ where: { id: body.classId, schoolId: user.schoolId } })
  if (!schoolClass) throw notFound('Selected class does not exist')
  if (body.sectionId) {
    const section = await db.section.findFirst({ where: { id: body.sectionId, classId: body.classId, schoolId: user.schoolId } })
    if (!section) throw badRequest('Selected section does not belong to that class')
  }

  const year = new Date().getFullYear()
  const seq = await admissionNumber.currentMax(user.schoolId, year)
  const admissionNumberStr = `${schoolPrefix(school?.name ?? 'SchoolDesk')}/${year}/${String(seq + 1).padStart(4, '0')}`

  const student = await db.student.create({ data: {
    schoolId: user.schoolId,
    admissionNumber: admissionNumberStr,
    firstName: applicant.firstName, lastName: applicant.lastName,
    gender: applicant.gender, dateOfBirth: applicant.dateOfBirth,
    classId: body.classId, sectionId: body.sectionId ?? null,
    status: 'ACTIVE', admissionDate: body.admissionDate,
  } })

  await db.applicant.update({
    where: { id },
    data: { status: 'ADMITTED', decidedAt: new Date().toISOString().slice(0, 10), admittedStudentId: student.id },
  })

  audit({
    action: 'CREATE', entity: 'Student', entityId: student.id,
    summary: `Converted application ${applicant.applicationNumber} → student ${admissionNumberStr} (${schoolClass.name})`,
  })
  return { id: student.id, admissionNumber: admissionNumberStr }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
