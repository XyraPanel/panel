import { desc, eq, or } from 'drizzle-orm'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { buildCacheKey, deleteCacheItems, withCache } from '~~/server/utils/cache'
import { buildScheduleListCacheKey, buildScheduleTasksCacheKey } from './cache-keys'

const SERVER_CACHE_TTL = 30
const SERVER_LIMITS_CACHE_TTL = 30
const SERVER_ALLOCATIONS_CACHE_TTL = 15
const SERVER_STARTUP_ENV_CACHE_TTL = 60
const SERVER_SCHEDULE_TASKS_CACHE_TTL = 60

type ServerRecord = typeof tables.servers.$inferSelect

export async function findServerByIdentifier(id: string) {
  const cacheKey = buildCacheKey('server', id)

  return withCache(cacheKey, async () => {
    const db = useDrizzle()

    const rows = db
      .select()
      .from(tables.servers)
      .where(
        or(
          eq(tables.servers.id, id),
          eq(tables.servers.uuid, id),
          eq(tables.servers.identifier, id),
        ),
      )
      .limit(1)
      .all()

    return rows[0] ?? null
  }, { ttl: SERVER_CACHE_TTL })
}

export async function getServerLimits(serverId: string) {
  const cacheKey = buildCacheKey('server', serverId, 'limits')

  return withCache(cacheKey, async () => {
    const db = useDrizzle()

    return db
      .select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, serverId))
      .limit(1)
      .all()
      .at(0) ?? null
  }, { ttl: SERVER_LIMITS_CACHE_TTL })
}

export async function listServerAllocations(serverId: string) {
  const cacheKey = buildCacheKey('server', serverId, 'allocations')

  return withCache(cacheKey, async () => {
    const db = useDrizzle()

    return db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, serverId))
      .all()
  }, { ttl: SERVER_ALLOCATIONS_CACHE_TTL })
}

export async function listServerStartupEnv(serverId: string) {
  const cacheKey = buildCacheKey('server', serverId, 'startup-env')

  return withCache(cacheKey, async () => {
    const db = useDrizzle()

    return db
      .select()
      .from(tables.serverStartupEnv)
      .where(eq(tables.serverStartupEnv.serverId, serverId))
      .all()
  }, { ttl: SERVER_STARTUP_ENV_CACHE_TTL })
}

export async function listServerScheduleTasks(scheduleId: string) {
  const cacheKey = buildScheduleTasksCacheKey(scheduleId)

  return withCache(cacheKey, async () => {
    const db = useDrizzle()

    return db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
      .orderBy(tables.serverScheduleTasks.sequenceId)
      .all()
  }, { ttl: SERVER_SCHEDULE_TASKS_CACHE_TTL })
}

export interface AuditQueryOptions {
  limit?: number
  cursor?: string | null
}

export async function listAuditEvents(options: AuditQueryOptions = {}) {
  const db = useDrizzle()
  const limit = options.limit ?? 50

  return db
    .select()
    .from(tables.auditEvents)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(limit)
    .all()
}

function collectServerCacheKeys(server: Partial<Pick<ServerRecord, 'id' | 'uuid' | 'identifier'>>) {
  const keys: string[] = []

  ;[server.id, server.uuid, server.identifier]
    .filter((value): value is string => Boolean(value))
    .forEach((identifier) => {
      keys.push(buildCacheKey('server', identifier))
    })

  if (server.id) {
    keys.push(
      buildCacheKey('server', server.id, 'limits'),
      buildCacheKey('server', server.id, 'allocations'),
      buildCacheKey('server', server.id, 'databases'),
      buildCacheKey('server', server.id, 'startup-env'),
      buildScheduleListCacheKey(server.id),
    )
  }

  return keys
}

export async function invalidateServerCaches(server: Partial<Pick<ServerRecord, 'id' | 'uuid' | 'identifier'>>) {
  const keys = collectServerCacheKeys(server)
  if (!keys.length) {
    return
  }

  await deleteCacheItems(...keys)
}

interface ScheduleCacheInvalidationPayload {
  serverId?: string | null
  scheduleId?: string | null
}

export async function invalidateScheduleCaches(payload: ScheduleCacheInvalidationPayload) {
  const keys: string[] = []

  if (payload.serverId) {
    keys.push(buildScheduleListCacheKey(payload.serverId))
  }

  if (payload.scheduleId) {
    keys.push(buildScheduleTasksCacheKey(payload.scheduleId))
  }

  if (!keys.length) {
    return
  }

  await deleteCacheItems(...keys)
}
