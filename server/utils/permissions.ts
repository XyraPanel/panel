

import { useDrizzle, tables, eq, and } from './drizzle'
import type { Session } from 'next-auth'

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
  'file.update': 'Modify files',
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

export type Permission = keyof typeof PERMISSIONS

export async function hasPermission(
  userId: string,
  serverId: string,
  permission: Permission
): Promise<boolean> {
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    return false
  }

  if (server.ownerId === userId) {
    return true
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
    return false
  }

  const permissions = subuser.permissions
    ? JSON.parse(subuser.permissions as string) as Permission[]
    : []

  return permissions.includes(permission)
}

export async function hasAllPermissions(
  userId: string,
  serverId: string,
  permissions: Permission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (!(await hasPermission(userId, serverId, permission))) {
      return false
    }
  }
  return true
}

export async function hasAnyPermission(
  userId: string,
  serverId: string,
  permissions: Permission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (await hasPermission(userId, serverId, permission)) {
      return true
    }
  }
  return false
}

export async function getUserPermissions(
  userId: string,
  serverId: string
): Promise<Permission[]> {
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
    return Object.keys(PERMISSIONS) as Permission[]
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
    ? JSON.parse(subuser.permissions as string) as Permission[]
    : []
}

export async function requirePermission(
  session: Session | null,
  serverId: string,
  permission: Permission
): Promise<void> {

  const { resolveSessionUser } = await import('./auth/sessionUser')
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw new Error('Unauthorized')
  }

  const hasAccess = await hasPermission(user.id, serverId, permission)
  if (!hasAccess) {
    throw new Error(`Missing permission: ${permission}`)
  }
}
