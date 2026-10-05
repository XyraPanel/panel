import { eq, desc } from 'drizzle-orm';
import type { ServerBackup } from '#shared/types/server';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { withCache, buildCacheKey, deleteCacheItem } from './cache';

const SERVER_BACKUPS_CACHE_TTL = 60;

function getServerBackupsCacheKey(serverId: string) {
  return buildCacheKey('server', serverId, 'backups');
}

export async function listServerBackups(serverId: string): Promise<ServerBackup[]> {
  const cacheKey = getServerBackupsCacheKey(serverId);

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();
      const backups = await db
        .select()
        .from(tables.serverBackups)
        .where(eq(tables.serverBackups.serverId, serverId))
        .orderBy(desc(tables.serverBackups.createdAt))
        // Defensive backstop — normally bounded per-server by serverLimits.backupLimit,
        // but that's admin-configurable with no upper bound enforced, so this guards
        // the pathological case rather than real usage.
        .limit(250);

      return backups.map((row) => ({
        id: row.id,
        serverId: row.serverId,
        uuid: row.uuid,
        name: row.name,
        ignoredFiles: row.ignoredFiles ? JSON.parse(row.ignoredFiles) : [],
        disk: row.disk,
        checksum: row.checksum,
        bytes: row.bytes,
        isSuccessful: row.isSuccessful,
        isLocked: row.isLocked,
        completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }));
    },
    { ttl: SERVER_BACKUPS_CACHE_TTL },
  );
}

export async function invalidateServerBackupsCache(serverId: string): Promise<void> {
  await deleteCacheItem(getServerBackupsCacheKey(serverId));
}
