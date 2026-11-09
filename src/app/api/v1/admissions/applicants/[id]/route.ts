import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { applicantUpdateSchema } from '@/lib/validation/admissions'

/** Valid pipeline moves (eSkooly-style). ADMITTED happens via /convert. */
const TRANSITIONS: Record<string, string[]> = {
  APPLIED: ['INTERVIEW', 'REJECTED', 'WAITLISTED'],
  INTERVIEW: ['ADMITTED', 'REJECTED', 'WAITLISTED', 'APPLIED'],
  ADMITTED: ['ADMITTED'], // converted separately
  WAITLISTED: ['INTERVIEW', 'ADMITTED', 'REJECTED'],
  REJECTED: [],
}

export const GET = createHandler({ permission: 'admissions.read' }, async ({ user, params }) => {
  const id = requireId(params.id, 'Applicant')
  const applicant = await db.applicant.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { classApplied: { select: { id: true, name: true, level: true } } },
  })
  if (!applicant) throw notFound('Applicant not found')
  return { ...applicant, allowedTransitions: applicant.admittedStudentId ? [] : TRANSITIONS[applicant.status] ?? [] }
})

export const PATCH = createHandler({ permission: 'admissions.write', body: applicantUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = requireId(params.id, 'Applicant')
  const applicant = await db.applicant.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!applicant) throw notFound('Applicant not found')

  if (body.status && body.status !== applicant.status) {
    if (applicant.status === 'ADMITTED') throw conflict('This applicant is already admitted — convert them to a student instead')
    const allowed = TRANSITIONS[applicant.status] ?? []
    if (!allowed.includes(body.status)) {
      throw badRequest(`Cannot move an applicant from ${applicant.status} to ${body.status}`)
    }
    if (body.status === 'ADMITTED' && !applicant.admittedStudentId) {
      throw badRequest('Use the "Convert to student" action to admit an applicant')
    }
  }

  const updated = await db.applicant.update({
    where: { id },
    data: {
      ...(body.firstName !== undefined ? { firstName: body.firstName.trim() } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName.trim() } : {}),
      ...(body.gender !== undefined ? { gender: body.gender } : {}),
      ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth ?? null } : {}),
      ...(body.parentName !== undefined ? { parentName: body.parentName.trim() } : {}),
      ...(body.parentPhone !== undefined ? { parentPhone: body.parentPhone.trim() } : {}),
      ...(body.parentEmail !== undefined ? { parentEmail: body.parentEmail?.trim() || null } : {}),
      ...(body.previousSchool !== undefined ? { previousSchool: body.previousSchool?.trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(body.classAppliedId !== undefined ? { classAppliedId: body.classAppliedId ?? null } : {}),
      ...(body.interviewAt !== undefined ? { interviewAt: body.interviewAt ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status, decidedAt: ['REJECTED', 'ADMITTED'].includes(body.status) ? new Date().toISOString().slice(0, 10) : applicant.decidedAt } : {}),
    },
  })
  audit({ action: 'UPDATE', entity: 'Applicant', entityId: id, summary: `Updated application ${applicant.applicationNumber}${body.status ? ` → ${body.status}` : ''}` })
  return { id: updated.id }
})

export const DELETE = createHandler({ permission: 'admissions.write' }, async ({ user, params, audit }) => {
  const id = requireId(params.id, 'Applicant')
  const applicant = await db.applicant.findFirst({ where: { id, schoolId: user.schoolId } })
  if (!applicant) throw notFound('Applicant not found')
  if (applicant.admittedStudentId) throw conflict('Admitted applicants become student records — remove the student instead')

  await db.applicant.delete({ where: { id } })
  audit({ action: 'DELETE', entity: 'Applicant', entityId: id, summary: `Deleted application ${applicant.applicationNumber}` })
  return { ok: true }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
