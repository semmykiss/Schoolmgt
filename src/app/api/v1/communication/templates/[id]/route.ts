import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict, notFound } from '@/lib/api/errors'
import { templateUpdateSchema } from '@/lib/validation/communication'

async function getTemplate(schoolId: string, id: string) {
  const template = await db.messageTemplate.findFirst({ where: { id, schoolId } })
  if (!template) throw notFound('Template not found')
  return template
}

export const GET = createHandler({ permission: 'communication.read' }, async ({ user, params }) =>
  getTemplate(user.schoolId, params.id))

export const PATCH = createHandler({ permission: 'communication.write', body: templateUpdateSchema }, async ({ user, params, body, audit }) => {
  const template = await getTemplate(user.schoolId, params.id)

  if (body.name && body.name !== template.name) {
    const clash = await db.messageTemplate.findFirst({
      where: { schoolId: user.schoolId, name: body.name, id: { not: template.id } },
      select: { id: true },
    })
    if (clash) throw conflict(`A template named "${body.name}" already exists`)
  }

  const updated = await db.messageTemplate.update({
    where: { id: template.id },
    data: {
      name: body.name ?? undefined,
      channel: body.channel ?? undefined,
      subject: body.subject === undefined ? undefined : (body.subject || null),
      body: body.body ?? undefined,
    },
  })
  audit({ action: 'update', entity: 'MessageTemplate', entityId: updated.id, summary: `Updated template "${updated.name}"` })
  return updated
})

export const DELETE = createHandler({ permission: 'communication.write' }, async ({ user, params, audit }) => {
  const template = await getTemplate(user.schoolId, params.id)
  await db.messageTemplate.delete({ where: { id: template.id } })
  audit({ action: 'delete', entity: 'MessageTemplate', entityId: template.id, summary: `Deleted template "${template.name}"` })
  return { ok: true }
})
