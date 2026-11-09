import { z } from 'zod'
import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'

const createSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(20),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
})

export const GET = createHandler({}, async ({ user }) =>
  db.branch.findMany({ where: { schoolId: user.schoolId }, orderBy: { isMain: 'desc' } }))

export const POST = createHandler({ permission: 'school.write', body: createSchema }, async ({ user, body, audit }) => {
  if (await db.branch.findFirst({ where: { schoolId: user.schoolId, code: body.code } })) {
    throw conflict('A branch with this code already exists')
  }
  const created = await db.branch.create({ data: {
    schoolId: user.schoolId, name: body.name, code: body.code,
    address: body.address ?? null, phone: body.phone ?? null,
  } })
  audit({ action: 'CREATE', entity: 'Branch', entityId: created.id, summary: `Created branch ${body.name}` })
  return { id: created.id }
})
