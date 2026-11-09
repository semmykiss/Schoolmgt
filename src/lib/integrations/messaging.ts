// Messaging integration layer (Phase 7) — pluggable drivers for EMAIL / SMS /
// WHATSAPP. Provider + credentials live in the school's Setting rows:
//   key 'sms.driver'       → JSON "mock" | "termii"
//   key 'email.driver'     → JSON "mock" | "sendgrid"
//   key 'whatsapp.driver'  → JSON "mock" | "termii"
//   key 'messaging.keys'   → JSON { termiiApiKey?, sendgridApiKey?, termiiSender?, sendgridFrom? }
// Sandbox default is the deterministic mock driver (status SIMULATED); real
// drivers are fully wired and activate as soon as keys are configured.

import { db } from '@/lib/db'

export type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP'
export type SendStatus = 'SENT' | 'FAILED' | 'SIMULATED'

export interface SendArgs {
  channel: Channel
  recipient: string // email address or phone number
  subject?: string
  body: string
}

export interface SendResult {
  status: SendStatus
  provider: string
  error?: string
}

interface MessagingKeys {
  termiiApiKey?: string
  termiiSender?: string
  sendgridApiKey?: string
  sendgridFrom?: string
}

/** Channel → Setting key that stores the driver name. */
const DRIVER_SETTING: Record<Channel, string> = {
  EMAIL: 'email.driver',
  SMS: 'sms.driver',
  WHATSAPP: 'whatsapp.driver',
}

async function readSetting(schoolId: string, key: string): Promise<unknown> {
  const row = await db.setting.findUnique({ where: { schoolId_key: { schoolId, key } } })
  if (!row) return undefined
  try { return JSON.parse(row.value) } catch { return row.value }
}

export async function messagingConfig(schoolId: string, channel: Channel): Promise<{ driver: string; keys: MessagingKeys }> {
  const [driver, rawKeys] = await Promise.all([
    readSetting(schoolId, DRIVER_SETTING[channel]),
    readSetting(schoolId, 'messaging.keys'),
  ])
  const keys = (rawKeys && typeof rawKeys === 'object') ? (rawKeys as MessagingKeys) : {}
  return { driver: typeof driver === 'string' ? driver : 'mock', keys }
}

// ── Driver: Termii (SMS + WhatsApp, Nigerian provider) ──────────────────────
async function sendViaTermii(args: SendArgs, keys: MessagingKeys): Promise<SendResult> {
  if (!keys.termiiApiKey) {
    // Configured driver but no key yet — fall back to simulation so the flow
    // stays testable while surfacing the reason in the delivery log.
    return { status: 'SIMULATED', provider: 'termii', error: 'No Termii API key configured — simulated' }
  }
  try {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: args.recipient,
        from: keys.termiiSender || 'SchoolDesk',
        sms: args.subject ? `${args.subject}\n${args.body}` : args.body,
        type: 'plain',
        channel: args.channel === 'WHATSAPP' ? 'whatsapp' : 'generic',
        api_key: keys.termiiApiKey,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { status: 'FAILED', provider: 'termii', error: `Termii responded ${res.status}` }
    return { status: 'SENT', provider: 'termii' }
  } catch (err) {
    return { status: 'FAILED', provider: 'termii', error: err instanceof Error ? err.message : 'Termii request failed' }
  }
}

// ── Driver: Sendgrid (Email) ────────────────────────────────────────────────
async function sendViaSendgrid(args: SendArgs, keys: MessagingKeys): Promise<SendResult> {
  if (!keys.sendgridApiKey || !keys.sendgridFrom) {
    return { status: 'SIMULATED', provider: 'sendgrid', error: 'No Sendgrid API key/sender configured — simulated' }
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.recipient }] }],
        from: { email: keys.sendgridFrom, name: 'SchoolDesk' },
        subject: args.subject || 'Message from SchoolDesk',
        content: [{ type: 'text/plain', value: args.body }],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { status: 'FAILED', provider: 'sendgrid', error: `Sendgrid responded ${res.status}` }
    return { status: 'SENT', provider: 'sendgrid' }
  } catch (err) {
    return { status: 'FAILED', provider: 'sendgrid', error: err instanceof Error ? err.message : 'Sendgrid request failed' }
  }
}

// ── Driver: Mock (deterministic, sandbox-safe) ──────────────────────────────
function sendViaMock(): SendResult {
  return { status: 'SIMULATED', provider: 'mock' }
}

/**
 * Send one message through the school's configured driver.
 * Never throws — failures are returned as SendResult and logged by the caller.
 */
export async function sendMessage(schoolId: string, args: SendArgs): Promise<SendResult> {
  const { driver, keys } = await messagingConfig(schoolId, args.channel)
  if (!args.recipient) return { status: 'FAILED', provider: driver, error: 'Missing recipient' }
  switch (driver) {
    case 'termii':
      return sendViaTermii(args, keys)
    case 'sendgrid':
      if (args.channel !== 'EMAIL') return sendViaMock()
      return sendViaSendgrid(args, keys)
    default:
      return sendViaMock()
  }
}

// ── Template rendering ──────────────────────────────────────────────────────
export type TemplateVars = Record<string, string | undefined>

/** Replace {{placeholder}} tokens; unknown tokens render as ''. */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}
