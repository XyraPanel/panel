import { eq, desc } from 'drizzle-orm'
import type { ServerBackup } from '#shared/types/server-backups'
import { useDrizzle } from './drizzle'
import * as tables from '~~/server/database/schema'

export async function listServerBackups(serverId: string): Promise<ServerBackup[]> {
  const db = useDrizzle()
  const backups = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.serverId, serverId))
    .orderBy(desc(tables.serverBackups.createdAt))

  return backups.map((row) => ({
    id: row.id,
    serverId: row.serverId,
    uuid: row.uuid,
    name: row.name,
    ignoredFiles: row.ignoredFiles ? JSON.parse(row.ignoredFiles) : [],
    disk: row.disk as 'wings' | 's3',
    checksum: row.checksum,
    bytes: row.bytes,
    isSuccessful: row.isSuccessful,
    isLocked: row.isLocked,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }))
}
