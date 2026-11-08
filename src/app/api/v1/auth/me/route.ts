import { createHandler } from '@/lib/api/handler'
import { sessionPayloadFor } from '@/lib/auth/session'

export const GET = createHandler({}, async ({ user }) => sessionPayloadFor(user))
