import { createHandler } from '@/lib/api/handler'
import { attendanceReport } from '@/lib/api/report-data'

export const GET = createHandler({ permission: 'reports.read' }, async ({ user, query }) => {
  return attendanceReport(user.schoolId, {
    from: query.get('from') ?? undefined,
    to: query.get('to') ?? undefined,
    classId: query.get('classId') ?? undefined,
  })
})
