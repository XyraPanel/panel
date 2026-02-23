import { eq } from 'drizzle-orm';
import type { ServerDatabase } from '#shared/types/server';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { withCache, buildCacheKey, setCacheItem } from './cache';

const SERVER_DATABASES_CACHE_TTL = 60;

export async function listServerDatabases(serverId: string): Promise<ServerDatabase[]> {
  const cacheKey = buildCacheKey('server', serverId, 'databases');

  const data = await withCache<ServerDatabase[] | { data?: ServerDatabase[] }>(
    cacheKey,
    async () => {
      const db = useDrizzle();
      const databases = await db
        .select({
          id: tables.serverDatabases.id,
          serverId: tables.serverDatabases.serverId,
          name: tables.serverDatabases.name,
          username: tables.serverDatabases.username,
          remote: tables.serverDatabases.remote,
          maxConnections: tables.serverDatabases.maxConnections,
          status: tables.serverDatabases.status,
          createdAt: tables.serverDatabases.createdAt,
          updatedAt: tables.serverDatabases.updatedAt,
          databaseHostId: tables.serverDatabases.databaseHostId,
          hostName: tables.databaseHosts.name,
          hostHostname: tables.databaseHosts.hostname,
          hostPort: tables.databaseHosts.port,
        })
        .from(tables.serverDatabases)
        .leftJoin(
          tables.databaseHosts,
          eq(tables.serverDatabases.databaseHostId, tables.databaseHosts.id),
        )
        .where(eq(tables.serverDatabases.serverId, serverId));

      return databases.map((row) => ({
        id: row.id,
        serverId: row.serverId,
        databaseHostId: row.databaseHostId || '',
        name: row.name,
        username: row.username,
        remote: row.remote,
        maxConnections: row.maxConnections,
        status: row.status || 'ready',
        host: {
          hostname: row.hostHostname || 'localhost',
          port: row.hostPort || 3306,
        },
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }));
    },
    { ttl: SERVER_DATABASES_CACHE_TTL },
  );

  if (Array.isArray(data)) {
    return data;
  }

  const normalized = Array.isArray(data?.data) ? data.data : [];
  console.warn(
    `[databases] Unexpected cached databases shape for ${cacheKey}, normalizing to array`,
  );
  await setCacheItem(cacheKey, normalized, { ttl: SERVER_DATABASES_CACHE_TTL });

  return normalized;
}
