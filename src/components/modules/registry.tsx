'use client'

import { MODULES } from '@/lib/nav'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { UsersView } from '@/components/modules/admin/users-view'
import { RolesView } from '@/components/modules/admin/roles-view'
import { ApiDocsView } from '@/components/modules/admin/api-docs-view'
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
    default:
      return <ComingSoon itemKey={MODULES[key] ? key : 'dashboard'} />
  }
}
