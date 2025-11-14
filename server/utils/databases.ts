import { eq } from 'drizzle-orm'
import type { ServerDatabase } from '#shared/types/server-databases'
import { useDrizzle } from './drizzle'
import * as tables from '~~/server/database/schema'

export async function listServerDatabases(serverId: string): Promise<ServerDatabase[]> {
  const db = useDrizzle()
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
    .leftJoin(tables.databaseHosts, eq(tables.serverDatabases.databaseHostId, tables.databaseHosts.id))
    .where(eq(tables.serverDatabases.serverId, serverId))

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
  }))
}
