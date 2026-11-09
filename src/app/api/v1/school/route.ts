import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { updateSchoolSchema } from '@/lib/validation/school'

export const GET = createHandler({}, async ({ user }) => {
  const school = await db.school.findUnique({ where: { id: user.schoolId } })
  return school
})

export const PATCH = createHandler({ permission: 'school.write', body: updateSchoolSchema }, async ({ user, body, audit }) => {
  const updated = await db.school.update({ where: { id: user.schoolId }, data: body })
  audit({ action: 'UPDATE', entity: 'School', entityId: user.schoolId, summary: 'Updated school profile/branding' })
  return updated
})
