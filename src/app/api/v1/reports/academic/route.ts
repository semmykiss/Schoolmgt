import { createHandler } from '@/lib/api/handler'
import { academicReport } from '@/lib/api/report-data'

export const GET = createHandler({ permission: 'reports.read' }, async ({ user, query }) => {
  return academicReport(user.schoolId, { examId: query.get('examId') ?? undefined })
})
