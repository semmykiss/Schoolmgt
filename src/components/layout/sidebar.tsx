'use client'

import { useState } from 'react'
import { ChevronDown, GraduationCap, HelpCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BUILT_PHASES, NAV_GROUPS, type NavItem } from '@/lib/nav'
import { navigate, useHashRoute } from '@/hooks/use-hash-route'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  /** Called after a nav item is clicked — used to close the mobile sheet. */
  onNavigate?: () => void
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const value = parts.map(p => p.charAt(0).toUpperCase()).join('')
  return value || '?'
}

export function Sidebar({ collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const { segments } = useHashRoute()
  const school = useSession(s => s.school)
  const user = useSession(s => s.user)
  const can = useSession(s => s.can)
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set())

  const activeKey = segments[0] ?? 'dashboard'

  const toggleGroup = (label: string) => {
    setClosedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const visibleGroups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter((i: NavItem) => can(i.permission)) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <button
          type="button"
          onClick={() => { navigate('/dashboard'); onNavigate?.() }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Go to dashboard"
        >
          <GraduationCap className="h-5 w-5" aria-hidden />
        </button>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{school?.name ?? 'SchoolDesk'}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {school?.type ? titleCase(school.type) : 'School management'}
              </p>
            </div>
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Nav groups */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {visibleGroups.map((group, gi) => (
          <Collapsible
            key={group.label}
            open={collapsed ? true : !closedGroups.has(group.label)}
            onOpenChange={() => { if (!collapsed) toggleGroup(group.label) }}
          >
            {collapsed ? (
              gi > 0 && <div className="my-2 border-t border-sidebar-border" aria-hidden />
            ) : (
              <CollapsibleTrigger
                className={cn(
                  'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  gi > 0 && 'mt-3',
                )}
              >
                {group.label}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90')}
                  aria-hidden
                />
              </CollapsibleTrigger>
            )}
            <CollapsibleContent className={cn(!collapsed && 'mt-1 space-y-0.5')}>
              {group.items.map(item => {
                const isActive = activeKey === item.key
                const link = (
                  <button
                    type="button"
                    onClick={() => { navigate(`/${item.key}`); onNavigate?.() }}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      collapsed && 'justify-center px-2',
                      isActive && 'bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary',
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.phase > 0 && !BUILT_PHASES.has(item.phase) && (
                          <span className="ml-auto shrink-0 rounded border border-sidebar-border bg-muted/60 px-1 py-px text-[10px] font-medium leading-4 text-muted-foreground">
                            P{item.phase}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
                return collapsed ? (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                      {item.phase > 0 && !BUILT_PHASES.has(item.phase) ? ` · Phase ${item.phase}` : ''}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={item.key}>{link}</div>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
        {visibleGroups.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
            <HelpCircle className="h-5 w-5" aria-hidden />
            No modules available for your role.
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-sidebar-accent/60 p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(user?.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">{user?.fullName ?? 'Signed in'}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">{titleCase(user?.role ?? '')}</p>
            </div>
          </div>
        ) : (
          onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="mx-auto flex h-11 w-11 text-muted-foreground"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </Button>
          )
        )}
      </div>
    </div>
  )
}
