'use client'

import { MODULES } from '@/lib/nav'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { UsersView } from '@/components/modules/admin/users-view'
import { RolesView } from '@/components/modules/admin/roles-view'
import { ApiDocsView } from '@/components/modules/admin/api-docs-view'
import { AcademicSetupView } from '@/components/modules/academics/academic-setup-view'
import { AdmissionsView } from '@/components/modules/admissions/admissions-view'
import { StudentsView } from '@/components/modules/students/students-view'
import { TimetableView } from '@/components/modules/timetable/timetable-view'
import { AttendanceView } from '@/components/modules/attendance/attendance-view'
import { ComingSoon } from '@/components/shared/coming-soon'

/**
 * Hash-router view registry. Routes for modules that are not built yet
 * render a phase-aware "coming soon" panel so the whole IA is explorable.
 */
export function RouterView({ segments }: { segments: string[] }) {
  const key = segments[0] ?? 'dashboard'
  switch (key) {
    case 'dashboard':
      return <DashboardView />
    case 'users':
      return <UsersView />
    case 'roles':
      return <RolesView />
    case 'api-docs':
      return <ApiDocsView />
    case 'academic':
      return <AcademicSetupView />
    case 'admissions':
      return <AdmissionsView />
    case 'students':
      return <StudentsView />
    case 'timetable':
      return <TimetableView />
    case 'attendance':
      return <AttendanceView />
    default:
      return <ComingSoon itemKey={MODULES[key] ? key : 'dashboard'} />
  }
}
