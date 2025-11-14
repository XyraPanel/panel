import { eq, sql } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { DatabaseHostWithStats } from '#shared/types/admin-database-hosts'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const hosts = await db
    .select({
      id: tables.databaseHosts.id,
      name: tables.databaseHosts.name,
      hostname: tables.databaseHosts.hostname,
      port: tables.databaseHosts.port,
      username: tables.databaseHosts.username,
      password: tables.databaseHosts.password,
      database: tables.databaseHosts.database,
      nodeId: tables.databaseHosts.nodeId,
      maxDatabases: tables.databaseHosts.maxDatabases,
      createdAt: tables.databaseHosts.createdAt,
      updatedAt: tables.databaseHosts.updatedAt,
      databaseCount: sql<number>`count(${tables.serverDatabases.id})`.as('databaseCount'),
    })
    .from(tables.databaseHosts)
    .leftJoin(tables.serverDatabases, eq(tables.serverDatabases.databaseHostId, tables.databaseHosts.id))
    .groupBy(tables.databaseHosts.id)
    .orderBy(tables.databaseHosts.name)
    .all()

  const data: DatabaseHostWithStats[] = hosts.map(host => ({
    id: host.id,
    name: host.name,
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    password: host.password,
    database: host.database,
    nodeId: host.nodeId,
    maxDatabases: host.maxDatabases,
    createdAt: new Date(host.createdAt).toISOString(),
    updatedAt: new Date(host.updatedAt).toISOString(),
    databaseCount: Number(host.databaseCount) || 0,
  }))

  return { data }
})
