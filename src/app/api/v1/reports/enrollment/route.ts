import { createHandler } from '@/lib/api/handler'
import { enrollmentReport } from '@/lib/api/report-data'

export const GET = createHandler({ permission: 'reports.read' }, async ({ user }) => {
  return enrollmentReport(user.schoolId)
})
