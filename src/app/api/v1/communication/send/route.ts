// POST /communication/send — channel + audience filter → driver → CommunicationLog
import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { notFound } from '@/lib/api/errors'
import { sendSchema } from '@/lib/validation/communication'
import { runBroadcast } from '@/lib/api/broadcast'

export const POST = createHandler({ permission: 'communication.send', body: sendSchema, rateLimit: { bucket: 'comm-send', limit: 20, windowMs: 60_000 } }, async ({ user, body, audit }) => {
  let subject = body.subject || null
  let bodyText = body.body || ''

  // Template supplies subject/body defaults; explicit overrides win
  if (body.templateId) {
    const template = await db.messageTemplate.findFirst({
      where: { id: body.templateId, schoolId: user.schoolId },
    })
    if (!template) throw notFound('Selected template does not exist')
    if (!subject && template.subject) subject = template.subject
    if (!bodyText) bodyText = template.body
  }

  const outcome = await runBroadcast({
    schoolId: user.schoolId,
    userId: user.id,
    channel: body.channel,
    subject: subject ?? undefined,
    body: bodyText,
    audience: body.audience,
  })

  audit({
    action: 'send',
    entity: 'CommunicationLog',
    summary: `Sent ${body.channel.toLowerCase()} broadcast to ${outcome.requested} recipient(s) — ${outcome.delivered} sent, ${outcome.simulated} simulated, ${outcome.failed} failed`,
  })
  return outcome
})
