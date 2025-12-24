import { and, eq, useDrizzle, tables } from '~~/server/utils/drizzle'
import { withCache } from '~~/server/utils/cache'
import { buildServerUserPermissionsCacheKey } from './cache-keys'

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

  'database.create': 'Create databases',
  'database.read': 'View databases',
  'database.update': 'Modify databases',
  'database.delete': 'Delete databases',
  'database.view_password': 'View database passwords',

  'schedule.create': 'Create schedules',
  'schedule.read': 'View schedules',
  'schedule.update': 'Modify schedules',
  'schedule.delete': 'Delete schedules',

  'settings.rename': 'Rename server',
  'settings.reinstall': 'Reinstall server',
} as const

const SERVER_USER_PERMISSIONS_CACHE_TTL = 60

async function resolveUserPermissions(
  userId: string,
  serverId: string,
): Promise<Array<keyof typeof PERMISSIONS>> {
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    return []
  }

  if (server.ownerId === userId) {
    const allPermissions = Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>
    const wingsPermissions = [
      'file.write',
      'file.upload',
      'file.download',
      'file.copy',
      'file.compress',
      'file.decompress',
      'file.chmod',
      'file.rename',
      'file.pull',
      'websocket.connect',
    ] as const

    const combined = [...allPermissions, ...wingsPermissions]
    return Array.from(new Set(combined)) as Array<keyof typeof PERMISSIONS>
  }

  const subuser = await db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(
        eq(tables.serverSubusers.serverId, serverId),
        eq(tables.serverSubusers.userId, userId)
      )
    )
    .get()

  if (!subuser) {
    return []
  }

  return subuser.permissions
    ? JSON.parse(subuser.permissions as string) as Array<keyof typeof PERMISSIONS>
    : []
}

export async function getUserPermissions(
  userId: string,
  serverId: string,
): Promise<Array<keyof typeof PERMISSIONS>> {
  const cacheKey = buildServerUserPermissionsCacheKey(serverId, userId)
  return withCache(cacheKey, () => resolveUserPermissions(userId, serverId), {
    ttl: SERVER_USER_PERMISSIONS_CACHE_TTL,
  })
}

export async function hasPermission(
  userId: string,
  serverId: string,
  permission: keyof typeof PERMISSIONS,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, serverId)
  return permissions.includes(permission)
}

export async function hasAllPermissions(
  userId: string,
  serverId: string,
  permissions: Array<keyof typeof PERMISSIONS>,
): Promise<boolean> {
  const granted = await getUserPermissions(userId, serverId)
  return permissions.every(permission => granted.includes(permission))
}

export async function hasAnyPermission(
  userId: string,
  serverId: string,
  permissions: Array<keyof typeof PERMISSIONS>,
): Promise<boolean> {
  const granted = await getUserPermissions(userId, serverId)
  return permissions.some(permission => granted.includes(permission))
}
