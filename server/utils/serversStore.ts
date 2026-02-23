import { desc, eq, or } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { buildCacheKey, deleteCacheItems, setCacheItem, withCache } from '#server/utils/cache';
import { buildScheduleListCacheKey, buildScheduleTasksCacheKey } from './cache-keys';

const SERVER_CACHE_TTL = 30;
const SERVER_LIMITS_CACHE_TTL = 30;
const SERVER_ALLOCATIONS_CACHE_TTL = 15;
const SERVER_STARTUP_ENV_CACHE_TTL = 60;
const SERVER_SCHEDULE_TASKS_CACHE_TTL = 60;

type ServerRecord = typeof tables.servers.$inferSelect;

export async function findServerByIdentifier(id: string) {
  const cacheKey = buildCacheKey('server', id);

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();

      const rows = await db
        .select()
        .from(tables.servers)
        .where(
          or(
            eq(tables.servers.id, id),
            eq(tables.servers.uuid, id),
            eq(tables.servers.identifier, id),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
    { ttl: SERVER_CACHE_TTL },
  );
}

export async function getServerLimits(serverId: string) {
  const cacheKey = buildCacheKey('server', serverId, 'limits');

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();

      const rows = await db
        .select()
        .from(tables.serverLimits)
        .where(eq(tables.serverLimits.serverId, serverId))
        .limit(1);

      return rows[0] ?? null;
    },
    { ttl: SERVER_LIMITS_CACHE_TTL },
  );
}

type ServerAllocationRow = typeof tables.serverAllocations.$inferSelect;

export async function listServerAllocations(serverId: string): Promise<ServerAllocationRow[]> {
  const cacheKey = buildCacheKey('server', serverId, 'allocations');

  const data = await withCache<ServerAllocationRow[] | { data?: ServerAllocationRow[] }>(
    cacheKey,
    async () => {
      const db = useDrizzle();

      return await db
        .select()
        .from(tables.serverAllocations)
        .where(eq(tables.serverAllocations.serverId, serverId));
    },
    { ttl: SERVER_ALLOCATIONS_CACHE_TTL },
  );

  if (Array.isArray(data)) {
    return data;
  }

  const normalized = Array.isArray(data?.data) ? data.data : [];

  console.warn(
    `[serversStore] Unexpected cached allocations shape for ${cacheKey}, normalizing to array`,
  );
  await setCacheItem(cacheKey, normalized, { ttl: SERVER_ALLOCATIONS_CACHE_TTL });

  return normalized;
}

export async function listServerStartupEnv(serverId: string) {
  const cacheKey = buildCacheKey('server', serverId, 'startup-env');

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();

      return await db
        .select()
        .from(tables.serverStartupEnv)
        .where(eq(tables.serverStartupEnv.serverId, serverId));
    },
    { ttl: SERVER_STARTUP_ENV_CACHE_TTL },
  );
}

export async function listServerScheduleTasks(scheduleId: string) {
  const cacheKey = buildScheduleTasksCacheKey(scheduleId);

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();

      return await db
        .select()
        .from(tables.serverScheduleTasks)
        .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
        .orderBy(tables.serverScheduleTasks.sequenceId);
    },
    { ttl: SERVER_SCHEDULE_TASKS_CACHE_TTL },
  );
}

export interface AuditQueryOptions {
  limit?: number;
  cursor?: string | null;
}

export async function listAuditEvents(options: AuditQueryOptions = {}) {
  const db = useDrizzle();
  const limit = options.limit ?? 50;

  return await db
    .select()
    .from(tables.auditEvents)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit);
}

function collectServerCacheKeys(server: Partial<Pick<ServerRecord, 'id' | 'uuid' | 'identifier'>>) {
  const keys: string[] = [];

  [server.id, server.uuid, server.identifier]
    .filter((value): value is string => Boolean(value))
    .forEach((identifier) => {
      keys.push(buildCacheKey('server', identifier));
    });

  if (server.id) {
    keys.push(
      buildCacheKey('server', server.id, 'limits'),
      buildCacheKey('server', server.id, 'allocations'),
      buildCacheKey('server', server.id, 'databases'),
      buildCacheKey('server', server.id, 'startup-env'),
      buildScheduleListCacheKey(server.id),
    );
  }

  return keys;
}

export async function invalidateServerCaches(
  server: Partial<Pick<ServerRecord, 'id' | 'uuid' | 'identifier'>>,
) {
  const keys = collectServerCacheKeys(server);
  if (!keys.length) {
    return;
  }

  await deleteCacheItems(...keys);
}

interface ScheduleCacheInvalidationPayload {
  serverId?: string | null;
  scheduleId?: string | null;
}

export async function invalidateScheduleCaches(payload: ScheduleCacheInvalidationPayload) {
  const keys: string[] = [];

  if (payload.serverId) {
    keys.push(buildScheduleListCacheKey(payload.serverId));
  }

  if (payload.scheduleId) {
    keys.push(buildScheduleTasksCacheKey(payload.scheduleId));
  }

  if (!keys.length) {
    return;
  }

  await deleteCacheItems(...keys);
}
