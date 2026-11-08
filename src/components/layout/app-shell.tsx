'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'sd.sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  // Lazy initializer — AppShell renders client-side after the session gate, so this is hydration-safe.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const school = useSession(s => s.school)

  // Persist collapsed state
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0')
    } catch { /* storage unavailable */ }
  }, [collapsed])

  const year = new Date().getFullYear()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden lg:block',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
      </aside>

      {/* Mobile nav sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72 [&>button]:text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>SchoolDesk main navigation</SheetDescription>
          </SheetHeader>
          <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Content column */}
      <div className={cn('flex flex-1 flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="mt-auto border-t bg-background">
          <div className="px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:px-6">
            © {year} {school?.name ?? 'SchoolDesk'} • SchoolDesk v0.1 • Phase 1 of 10 — Academic Setup
          </div>
        </footer>
      </div>
    </div>
  )
}
