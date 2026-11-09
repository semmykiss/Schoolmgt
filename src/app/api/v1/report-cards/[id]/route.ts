import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { reportCardUpdateSchema } from '@/lib/validation/exams'

const getId = (p: Record<string, string>) => requireId(p.id, 'Report card')

export const PATCH = createHandler({ permission: 'exams.write', body: reportCardUpdateSchema }, async ({ user, params, body, audit }) => {
  const id = getId(params as Record<string, string>)
  const existing = await db.reportCard.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { student: { select: { firstName: true, lastName: true } }, exam: { select: { name: true } } },
  })
  if (!existing) throw notFound('Report card not found')

  const updated = await db.reportCard.update({
    where: { id },
    data: {
      teacherRemark: body.teacherRemark === undefined ? undefined : body.teacherRemark,
      principalRemark: body.principalRemark === undefined ? undefined : body.principalRemark,
      published: body.published,
    },
  })
  audit({
    action: 'UPDATE', entity: 'ReportCard', entityId: id,
    summary: `Updated report card for ${existing.student.firstName} ${existing.student.lastName} (${existing.exam.name})`,
  })
  return updated
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
