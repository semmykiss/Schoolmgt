import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { requireId } from '@/lib/api/paginate'
import { notifyUsers, studentCircleUserIds } from '@/lib/api/notify'
import { examPublishSchema } from '@/lib/validation/exams'

/**
 * Publish / unpublish exam results.
 * publishResults=true also flips every ReportCard of this exam to published
 * so the parent & student portals see the results immediately.
 */
export const POST = createHandler({ permission: 'exams.publish', body: examPublishSchema }, async ({ user, params, body, audit }) => {
  const id = requireId((params as Record<string, string>).id, 'Exam')
  const exam = await db.exam.findFirst({
    where: { id, schoolId: user.schoolId },
    include: { _count: { select: { reportCards: true, results: true } } },
  })
  if (!exam) throw notFound('Exam not found')

  const data: { publishResults?: boolean; publishClassScores?: boolean } = {}
  if (body.publishResults !== undefined) data.publishResults = body.publishResults
  if (body.publishClassScores !== undefined) data.publishClassScores = body.publishClassScores

  if (data.publishResults && exam._count.reportCards === 0) {
    throw notFound('No report cards generated yet — generate them from the Broadsheet tab before publishing.')
  }

  const updated = await db.exam.update({ where: { id }, data })

  if (data.publishResults !== undefined) {
    await db.reportCard.updateMany({ where: { examId: id, schoolId: user.schoolId }, data: { published: data.publishResults } })

    // Fan out to every affected student's portal circle (student + guardians)
    // when results go live.
    if (data.publishResults === true) {
      const cards = await db.reportCard.findMany({
        where: { examId: id, schoolId: user.schoolId },
        select: {
          student: {
            select: {
              userId: true,
              guardians: { select: { guardian: { select: { userId: true } } } },
            },
          },
        },
      })
      const circle = new Set<string>()
      for (const c of cards) for (const uid of await studentCircleUserIds(c.student)) circle.add(uid)
      await notifyUsers(user.schoolId, circle, {
        title: `Results published — ${exam.name}`,
        body: 'Report cards are now available on the portal.',
        type: 'RESULT',
        link: '#/portal',
      })
    }
  }

  audit({
    action: 'UPDATE', entity: 'Exam', entityId: id,
    summary: `${data.publishResults === true ? 'Published' : data.publishResults === false ? 'Unpublished' : 'Updated visibility of'} results for "${exam.name}"`,
  })
  return updated
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
