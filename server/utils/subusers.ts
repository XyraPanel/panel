import { eq } from 'drizzle-orm'
import * as tables from '~~/server/database/schema'
import { useDrizzle } from './drizzle'
import type { ServerSubuser } from '#shared/types/server-subusers'

export async function listServerSubusers(serverId: string): Promise<ServerSubuser[]> {
  const db = useDrizzle()
  const subusers = await db
    .select({
      id: tables.serverSubusers.id,
      serverId: tables.serverSubusers.serverId,
      userId: tables.serverSubusers.userId,
      permissions: tables.serverSubusers.permissions,
      createdAt: tables.serverSubusers.createdAt,
      updatedAt: tables.serverSubusers.updatedAt,
      username: tables.users.username,
      email: tables.users.email,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(eq(tables.serverSubusers.serverId, serverId))
    .orderBy(tables.users.username)

  return subusers.map((row) => ({
    id: row.id,
    serverId: row.serverId,
    userId: row.userId,
    username: row.username || 'Unknown',
    email: row.email || '',
    permissions: JSON.parse(row.permissions) as string[],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }))
}
