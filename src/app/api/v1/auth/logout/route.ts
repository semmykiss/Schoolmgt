import { createHandler } from '@/lib/api/handler'
import { clearAuthResponse } from '@/lib/auth/session'
import { revokeRefreshToken } from '@/lib/auth/tokens'
import { COOKIES } from '@/lib/auth/session'

export const POST = createHandler({ auth: false }, async ({ req }) => {
  const raw = req.cookies.get(COOKIES.refresh)?.value
  if (raw) await revokeRefreshToken(raw)
  return clearAuthResponse()
})
