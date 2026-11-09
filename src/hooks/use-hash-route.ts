'use client'

import { useSyncExternalStore, useCallback } from 'react'

export interface HashRoute {
  path: string // e.g. "/students/abc?tab=fees" (no leading '#')
  segments: string[] // path split, query removed, empty segments dropped
  query: URLSearchParams
}

function parseHash(): HashRoute {
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard'
  const [pathPart, queryPart] = raw.split('?')
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryPart ?? ''),
  }
}

const listeners = new Set<() => void>()
let cacheHash = ''
let cacheRoute: HashRoute = { path: '/dashboard', segments: ['dashboard'], query: new URLSearchParams() }

function computeRoute(): HashRoute {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  if (hash !== cacheHash) {
    cacheHash = hash
    cacheRoute = parseHash()
  }
  return cacheRoute
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): HashRoute {
  return computeRoute()
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    listeners.forEach(l => l())
  })
}

const SERVER_SNAPSHOT: HashRoute = { path: '/dashboard', segments: ['dashboard'], query: new URLSearchParams() }

export function useHashRoute(): HashRoute {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
}

export function useNavigate() {
  return useCallback((to: string) => {
    window.location.hash = to.startsWith('#') ? to.slice(1) : to
  }, [])
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to.slice(1) : to
}
