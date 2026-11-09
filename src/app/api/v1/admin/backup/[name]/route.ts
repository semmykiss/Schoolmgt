// GET    /api/v1/admin/backup/:name  download a snapshot
// DELETE /api/v1/admin/backup/:name  remove a snapshot

import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createHandler } from '@/lib/api/handler'
import { notFound, badRequest } from '@/lib/api/errors'
import { backupsDir, isBackupName } from '@/lib/api/backup'

export const GET = createHandler({ permission: 'settings.read' }, async ({ params }) => {
  const name = params.name
  if (!isBackupName(name)) throw badRequest('Invalid backup file name')
  try {
    const bytes = await readFile(path.join(backupsDir(), name))
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    throw notFound('Backup not found')
  }
})

export const DELETE = createHandler({ permission: 'settings.write' }, async ({ user, params, audit }) => {
  const name = params.name
  if (!isBackupName(name)) throw badRequest('Invalid backup file name')
  try {
    await unlink(path.join(backupsDir(), name))
  } catch {
    throw notFound('Backup not found')
  }
  audit({ action: 'DELETE', entity: 'DatabaseBackup', entityId: name, summary: `Deleted database backup ${name}` })
  return { ok: true }
})
