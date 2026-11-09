// Database snapshot helpers shared by the backup routes.

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const BACKUP_PATTERN = /^schooldesk-backup-[\w.-]+\.db$/

export function databaseFilePath(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./db/custom.db'
  const target = raw.startsWith('file:') ? raw.slice(5) : raw
  if (path.isAbsolute(target)) return target
  // relative SQLite URLs are resolved against the prisma folder by Prisma
  const fromPrisma = path.resolve(process.cwd(), 'prisma', target)
  if (existsSync(fromPrisma)) return fromPrisma
  return path.resolve(process.cwd(), target)
}

export function backupsDir(): string {
  return path.resolve(process.cwd(), 'backups')
}

export function isBackupName(name: string): boolean {
  return BACKUP_PATTERN.test(name)
}

export interface BackupFileInfo {
  name: string
  sizeBytes: number
  createdAt: string
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  const dir = backupsDir()
  if (!existsSync(dir)) return []
  const names = (await readdir(dir)).filter(n => BACKUP_PATTERN.test(n)).sort().reverse()
  const out: BackupFileInfo[] = []
  for (const name of names) {
    const s = await stat(path.join(dir, name))
    out.push({ name, sizeBytes: s.size, createdAt: s.birthtime.toISOString() })
  }
  return out
}

export async function createBackup(): Promise<BackupFileInfo> {
  const dbFile = databaseFilePath()
  if (!existsSync(dbFile)) throw new Error('Database file not found')
  const dir = backupsDir()
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const name = `schooldesk-backup-${stamp}.db`
  const dest = path.join(dir, name)
  await copyFile(dbFile, dest)
  const s = await stat(dest)
  return { name, sizeBytes: s.size, createdAt: s.birthtime.toISOString() }
}
