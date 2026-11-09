import { createHandler } from '@/lib/api/handler'
import { financialReport } from '@/lib/api/report-data'

export const GET = createHandler({ permission: 'reports.read' }, async ({ user, query }) => {
  return financialReport(user.schoolId, {
    termId: query.get('termId') ?? undefined,
    from: query.get('from') ?? undefined,
    to: query.get('to') ?? undefined,
  })
})
