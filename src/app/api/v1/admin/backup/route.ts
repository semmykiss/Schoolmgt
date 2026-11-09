// School database backups — SQLite file snapshots into /backups.
// GET  /api/v1/admin/backup  list snapshots
// POST /api/v1/admin/backup  create a snapshot now

import { createHandler } from '@/lib/api/handler'
import { badRequest } from '@/lib/api/errors'
import { createBackup, listBackups, databaseFilePath } from '@/lib/api/backup'
import path from 'node:path'

export const GET = createHandler({ permission: 'settings.read' }, async () => {
  return { items: await listBackups(), dbFile: path.basename(databaseFilePath()) }
})

export const POST = createHandler({ permission: 'settings.write' }, async ({ user, audit }) => {
  try {
    const file = await createBackup()
    audit({ action: 'CREATE', entity: 'DatabaseBackup', entityId: file.name, summary: `Created database backup ${file.name}` })
    return file
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Backup failed')
  }
})
