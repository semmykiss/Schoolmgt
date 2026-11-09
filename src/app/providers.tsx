'use client'

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'

/**
 * Module-level singleton so non-React code (the zustand session store) can
 * reset the cache when the signed-in account changes — otherwise a previous
 * user's portal data could flash for the next user.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
