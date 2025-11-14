import type { WingsJWTClaims as _WingsJWTClaims } from '#shared/types/wings'
import { useDrizzle, tables, eq, and } from './drizzle'

const ADMIN_PERMISSIONS = [
  'control.console',
  'control.start',
  'control.stop',
  'control.restart',
  'websocket.connect',
  'admin.websocket.errors',
  'admin.websocket.install',
  'admin.websocket.transfer',
  'file.read',
  'file.write',
  'file.delete',
  'file.rename',
  'file.download',
  'file.upload',
  'file.copy',
  'file.create',
  'file.chmod',
  'file.compress',
  'file.decompress',
  'file.pull',
]

const DEFAULT_SUBUSER_PERMISSIONS = [
  'control.console',
  'control.start',
  'control.stop',
  'control.restart',
  'websocket.connect',
  'file.read',
  'file.write',
  'file.download',
  'file.upload',
  'file.copy',
]

export function normalizePermissionPayload(payload: unknown): string[] {
  if (!payload) {
    return []
  }

  let raw: unknown
  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload)
    }
    catch {
      return []
    }
  }
  else {
    raw = payload
  }

  const list = Array.isArray(raw) ? raw : []
  return list
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

interface GetUserPermissionsOptions {
  isAdmin?: boolean
  isOwner?: boolean
  subuserPermissions?: string[] | null
}

async function _getUserPermissionsJWT(
  userId: string,
  serverId: string,
  options: GetUserPermissionsOptions = {},
): Promise<string[]> {
  const { isAdmin = false, isOwner = false, subuserPermissions = null } = options

  if (isAdmin || isOwner) {
    return ADMIN_PERMISSIONS
  }

  const explicitPermissions = subuserPermissions ?? await fetchSubuserPermissions(userId, serverId)

  if (!explicitPermissions || explicitPermissions.length === 0) {
    return DEFAULT_SUBUSER_PERMISSIONS
  }

  const deduped = Array.from(new Set(explicitPermissions))

  if (!deduped.includes('websocket.connect')) {
    deduped.push('websocket.connect')
  }

  return deduped
}

async function fetchSubuserPermissions(userId: string, serverId: string): Promise<string[] | null> {
  if (!userId) {
    return null
  }

  const db = useDrizzle()
  const record = db
    .select({ permissions: tables.serverSubusers.permissions })
    .from(tables.serverSubusers)
    .where(and(
      eq(tables.serverSubusers.serverId, serverId),
      eq(tables.serverSubusers.userId, userId),
    ))
    .limit(1)
    .get()

  if (!record) {
    return null
  }

  return normalizePermissionPayload(record.permissions)
}
