import { and, eq, useDrizzle, tables } from '#server/utils/drizzle';
import { withCache, setCacheItem } from '#server/utils/cache';
import { buildServerUserPermissionsCacheKey } from './cache-keys';

export const PERMISSIONS = {
  'control.console': 'Access server console',
  'control.start': 'Start server',
  'control.stop': 'Stop server',
  'control.restart': 'Restart server',

  'user.create': 'Create subusers',
  'user.read': 'View subusers',
  'user.update': 'Modify subusers',
  'user.delete': 'Delete subusers',

  'file.create': 'Create files',
  'file.read': 'Read files',
  'file.write': 'Write/modify files', // Alias for file.update (Wings format)
  'file.update': 'Modify files', // Panel format
  'file.delete': 'Delete files',
  'file.archive': 'Compress/decompress files',
  'file.sftp': 'Access SFTP',

  'backup.create': 'Create backups',
  'backup.read': 'View backups',
  'backup.delete': 'Delete backups',
  'backup.download': 'Download backups',
  'backup.restore': 'Restore backups',

  'allocation.read': 'View allocations',
  'allocation.create': 'Create allocations',
  'allocation.update': 'Modify allocations',
  'allocation.delete': 'Delete allocations',

  'startup.read': 'View startup settings',
  'startup.update': 'Modify startup settings',

  'schedule.create': 'Create schedules',
  'schedule.read': 'View schedules',
  'schedule.update': 'Modify schedules',
  'schedule.delete': 'Delete schedules',

  'database.create': 'Create databases',
  'database.read': 'View databases',
  'database.update': 'Modify databases',
  'database.delete': 'Delete databases',
  'database.view_password': 'View database passwords',

  'settings.rename': 'Rename server',
  'settings.reinstall': 'Reinstall server',
} as const;

const SERVER_USER_PERMISSIONS_CACHE_TTL = 60;

function isTruthyPermissionValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }

  return false;
}

function normalizePermissionList(payload: unknown): string[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return Array.from(
      new Set(
        payload
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  }

  if (payload instanceof Set) {
    return normalizePermissionList(Array.from(payload));
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return normalizePermissionList(parsed);
    } catch {
      return [];
    }
  }

  if (typeof payload === 'object') {
    const objectPayload = payload as Record<string, unknown>;

    if (Array.isArray(objectPayload.permissions)) {
      return normalizePermissionList(objectPayload.permissions);
    }

    return Object.entries(objectPayload)
      .filter(([, value]) => isTruthyPermissionValue(value))
      .map(([permission]) => permission.trim())
      .filter((permission) => permission.length > 0);
  }

  return [];
}

function resolveServerOwnerPermissions(): Array<keyof typeof PERMISSIONS> {
  const allPermissions = Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>;
  const wingsPermissions = new Set(['file.write', 'file.update']);

  return allPermissions.filter((permission) => !wingsPermissions.has(permission));
}

async function resolveUserPermissions(
  userId: string,
  serverId: string,
): Promise<Array<keyof typeof PERMISSIONS>> {
  const db = useDrizzle();

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  if (!server) {
    return [];
  }

  if (server.ownerId === userId) {
    return resolveServerOwnerPermissions();
  }

  const [subuser] = await db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(eq(tables.serverSubusers.serverId, serverId), eq(tables.serverSubusers.userId, userId)),
    )
    .limit(1);

  if (!subuser) {
    return [];
  }

  return normalizePermissionList(subuser.permissions) as Array<keyof typeof PERMISSIONS>;
}

export async function getUserPermissions(
  userId: string,
  serverId: string,
): Promise<Array<keyof typeof PERMISSIONS>> {
  const cacheKey = buildServerUserPermissionsCacheKey(serverId, userId);
  const cached = await withCache<unknown>(
    cacheKey,
    () => resolveUserPermissions(userId, serverId),
    {
      ttl: SERVER_USER_PERMISSIONS_CACHE_TTL,
    },
  );

  const normalized = normalizePermissionList(cached) as Array<keyof typeof PERMISSIONS>;

  if (
    !Array.isArray(cached) ||
    cached.length !== normalized.length ||
    cached.some((value, index) => value !== normalized[index])
  ) {
    await setCacheItem(cacheKey, normalized, { ttl: SERVER_USER_PERMISSIONS_CACHE_TTL });
  }

  return normalized;
}

export async function hasPermission(
  userId: string,
  serverId: string,
  permission: keyof typeof PERMISSIONS,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, serverId);
  return permissions.includes(permission);
}

export async function hasAllPermissions(
  userId: string,
  serverId: string,
  permissions: Array<keyof typeof PERMISSIONS>,
): Promise<boolean> {
  const granted = await getUserPermissions(userId, serverId);
  return permissions.every((permission) => granted.includes(permission));
}

export async function hasAnyPermission(
  userId: string,
  serverId: string,
  permissions: Array<keyof typeof PERMISSIONS>,
): Promise<boolean> {
  const granted = await getUserPermissions(userId, serverId);
  return permissions.some((permission) => granted.includes(permission));
}
