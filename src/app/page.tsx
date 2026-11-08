'use client'

import { useEffect } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { useSession } from '@/stores/session'
import { useHashRoute } from '@/hooks/use-hash-route'
import { AppShell } from '@/components/layout/app-shell'
import { LoginView } from '@/components/modules/auth/login-view'
import { PortalHome } from '@/components/modules/portals/portal-home'
import { RouterView } from '@/components/modules/registry'

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <GraduationCap className="h-7 w-7" aria-hidden />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading SchoolDesk…</p>
      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
    </div>
  )
}

export default function Page() {
  const status = useSession(s => s.status)
  const role = useSession(s => s.user?.role)
  const route = useHashRoute()

  useEffect(() => {
    if (status === 'loading') void useSession.getState().refresh()
  }, [status])

  if (status === 'loading') return <Splash />
  if (status === 'anonymous') return <LoginView />
  if (role === 'PARENT' || role === 'STUDENT') return <PortalHome />

  return (
    <AppShell>
      <RouterView segments={route.segments} />
    </AppShell>
  )
}
