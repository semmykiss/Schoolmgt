// Broadcast pipeline (Phase 7) — shared by POST /communication/send and the
// /preview estimator: audience spec → contacts → channel filter → render → send.
import { db } from '@/lib/db'
import { renderTemplate, sendMessage, type Channel, type SendStatus } from '@/lib/integrations/messaging'
import { resolveAudienceContacts, contactsForChannel, type SendAudienceSpec } from './audience'

export interface BroadcastOutcome {
  requested: number
  delivered: number
  failed: number
  simulated: number
  statusCounts: Record<SendStatus, number>
  logs: { recipient: string; status: SendStatus; error: string | null }[]
}

export async function estimateRecipients(schoolId: string, channel: Channel, spec: SendAudienceSpec) {
  const contacts = contactsForChannel(await resolveAudienceContacts(schoolId, spec), channel)
  return { count: contacts.length, sample: contacts.slice(0, 5).map(c => ({ recipient: c.recipient, name: c.name ?? null })) }
}

export async function runBroadcast(args: {
  schoolId: string
  userId: string
  channel: Channel
  subject?: string
  body: string
  audience: SendAudienceSpec
}): Promise<BroadcastOutcome> {
  const contacts = contactsForChannel(await resolveAudienceContacts(args.schoolId, args.audience), args.channel)

  const statusCounts: Record<SendStatus, number> = { SENT: 0, FAILED: 0, SIMULATED: 0 }
  const now = new Date()

  // School name + today's date are available to every message via vars
  const school = await db.school.findUnique({ where: { id: args.schoolId }, select: { name: true } })

  // Mock driver → no network; real drivers → small batches with concurrency 5
  // keeps third-party rate limits safe.
  const BATCH = 5
  type PendingLog = {
    recipient: string
    subject: string | null
    body: string
    status: SendStatus
    provider: string
    error: string | null
    sentAt: Date | null
  }
  const logs: PendingLog[] = []

  for (let i = 0; i < contacts.length; i += BATCH) {
    const slice = contacts.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(async contact => {
      const body = renderTemplate(args.body, {
        school: school?.name,
        name: contact.name,
        student: contact.studentName,
        date: now.toISOString().slice(0, 10),
      })
      const subject = args.subject ? renderTemplate(args.subject, { school: school?.name, name: contact.name, student: contact.studentName, date: now.toISOString().slice(0, 10) }) : null
      const result = await sendMessage(args.schoolId, { channel: args.channel, recipient: contact.recipient, subject: subject ?? undefined, body })
      return { contact, body, subject, result }
    }))
    for (const r of results) {
      statusCounts[r.result.status]++
      logs.push({
        recipient: r.contact.recipient,
        subject: r.subject,
        body: r.body,
        status: r.result.status,
        provider: r.result.provider,
        error: r.result.error ?? null,
        sentAt: r.result.status === 'FAILED' ? null : now,
      })
    }
  }

  if (logs.length > 0) {
    await db.communicationLog.createMany({ data: logs.map(l => ({
      schoolId: args.schoolId,
      channel: args.channel,
      recipient: l.recipient,
      subject: l.subject,
      body: l.body,
      status: l.status,
      provider: l.provider,
      error: l.error,
      sentAt: l.sentAt ?? now,
      createdById: args.userId,
    })) })
  }

  return {
    requested: contacts.length,
    delivered: statusCounts.SENT,
    failed: statusCounts.FAILED,
    simulated: statusCounts.SIMULATED,
    statusCounts,
    logs: logs.slice(0, 10).map(l => ({ recipient: l.recipient, status: l.status, error: l.error })),
  }
}
