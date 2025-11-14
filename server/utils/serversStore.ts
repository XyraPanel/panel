import { desc, eq, or } from 'drizzle-orm'
import { useDrizzle, tables } from './drizzle'
import { buildCacheKey, withCache } from './cache'

const SERVER_CACHE_TTL = 30

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
  const db = useDrizzle()

  return db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1)
    .all()
    .at(0) ?? null
}

export async function listServerAllocations(serverId: string) {
  const db = useDrizzle()

  return db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, serverId))
    .all()
}

export async function listServerStartupEnv(serverId: string) {
  const db = useDrizzle()

  return db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, serverId))
    .all()
}

export async function listServerScheduleTasks(scheduleId: string) {
  const db = useDrizzle()

  return db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
    .orderBy(tables.serverScheduleTasks.sequenceId)
    .all()
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
