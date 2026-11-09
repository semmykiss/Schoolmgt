// POST /communication/send/preview — recipient estimate without sending.
// Powers the "N recipients" counter in the compose view.
import { createHandler } from '@/lib/api/handler'
import { sendSchema } from '@/lib/validation/communication'
import { estimateRecipients } from '@/lib/api/broadcast'

export const POST = createHandler({ permission: 'communication.write', body: sendSchema }, async ({ user, body }) =>
  estimateRecipients(user.schoolId, body.channel, body.audience))
