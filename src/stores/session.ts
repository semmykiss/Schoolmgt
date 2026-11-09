'use client'

import { create } from 'zustand'
import { api } from '@/lib/client/api'
import { can as canPerm } from '@/lib/auth/permissions-client'
import { queryClient } from '@/app/providers'

export interface SessionUser {
  id: string; email: string; fullName: string; role: string
  avatarUrl: string | null; phone: string | null; branchId: string | null
  permissions: string[]
}
export interface SessionSchool {
  id: string; name: string; slug: string; type: string; logoUrl: string | null
  primaryColor: string; secondaryColor: string; currency: string
  city: string | null; state: string | null; country: string
  phone: string | null; email: string | null; motto: string | null
  address: string | null; timezone: string
}
export interface SessionBranch { id: string; name: string; code: string; isMain: boolean }

interface SessionState {
  status: 'loading' | 'authed' | 'anonymous'
  user: SessionUser | null
  school: SessionSchool | null
  branches: SessionBranch[]
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (input: { schoolName: string; schoolType: string; adminName: string; email: string; phone?: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  can: (permission?: string) => boolean
  role: () => string
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  school: null,
  branches: [],

  refresh: async () => {
    try {
      const data = await api<{ user: SessionUser; school: SessionSchool; branches: SessionBranch[] }>('/auth/me')
      set({ status: 'authed', user: data.user, school: data.school, branches: data.branches })
    } catch {
      set({ status: 'anonymous', user: null, school: null, branches: [] })
    }
  },

  login: async (email, password) => {
    const data = await api<{ user: SessionUser; school: SessionSchool; branches: SessionBranch[] }>('/auth/login', {
      method: 'POST', body: { email, password },
    })
    queryClient.clear() // drop any data cached under a previous account
    set({ status: 'authed', user: data.user, school: data.school, branches: data.branches })
  },

  register: async (input) => {
    const data = await api<{ user: SessionUser; school: SessionSchool; branches: SessionBranch[] }>('/auth/register', {
      method: 'POST', body: input,
    })
    queryClient.clear()
    set({ status: 'authed', user: data.user, school: data.school, branches: data.branches })
  },

  logout: async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    queryClient.clear() // never leak the signed-in user's data to the next login
    set({ status: 'anonymous', user: null, school: null, branches: [] })
  },

  can: (permission) => canPerm(get().user?.permissions ?? [], permission),
  role: () => get().user?.role ?? '',
}))
