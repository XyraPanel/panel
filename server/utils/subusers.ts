import { eq } from 'drizzle-orm';
import * as tables from '#server/database/schema';
import { useDrizzle } from '#server/utils/drizzle';
import type { ServerSubuser } from '#shared/types/server';
import { deleteCacheItems, withCache } from './cache';
import {
  buildServerSubusersCacheKey,
  buildServerUserPermissionsCacheKey,
  buildUserPermissionsMapCacheKey,
} from './cache-keys';

const SERVER_SUBUSERS_CACHE_TTL = 60;

interface ServerSubuserRow {
  id: string;
  serverId: string;
  userId: string;
  permissions: string;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  email: string | null;
  image: string | null;
}

async function fetchServerSubusers(serverId: string): Promise<ServerSubuser[]> {
  const db = useDrizzle();
  const subusers = (await db
    .select({
      id: tables.serverSubusers.id,
      serverId: tables.serverSubusers.serverId,
      userId: tables.serverSubusers.userId,
      permissions: tables.serverSubusers.permissions,
      createdAt: tables.serverSubusers.createdAt,
      updatedAt: tables.serverSubusers.updatedAt,
      username: tables.users.username,
      email: tables.users.email,
      image: tables.users.image,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(eq(tables.serverSubusers.serverId, serverId))
    .orderBy(tables.users.username)) as ServerSubuserRow[];

  return subusers.map((row) => ({
    id: row.id,
    serverId: row.serverId,
    userId: row.userId,
    username: row.username || 'Unknown',
    email: row.email || '',
    image: row.image,
    permissions: JSON.parse(row.permissions) as string[],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export async function listServerSubusers(serverId: string): Promise<ServerSubuser[]> {
  const cacheKey = buildServerSubusersCacheKey(serverId);
  return withCache(cacheKey, () => fetchServerSubusers(serverId), {
    ttl: SERVER_SUBUSERS_CACHE_TTL,
  });
}

export async function invalidateServerSubusersCache(serverId: string, userIds: string[] = []) {
  const keys: string[] = [];

  if (serverId) {
    keys.push(buildServerSubusersCacheKey(serverId));
  }

  if (serverId && userIds.length) {
    userIds.filter(Boolean).forEach((userId) => {
      keys.push(buildServerUserPermissionsCacheKey(serverId, userId));
      keys.push(buildUserPermissionsMapCacheKey(userId));
    });
  }

  if (!keys.length) {
    return;
  }

  await deleteCacheItems(...keys);
}
