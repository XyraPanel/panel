import type { H3Event } from 'h3'
import { createError, getQuery } from 'h3'
import { getServerSession } from '#auth'
import type { SessionUser } from '#shared/types/auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { normalizePermissionPayload } from '~~/server/utils/jwt'
import { getUserPermissions } from '~~/server/utils/permissions'
import { resolveNodeConnection } from '~~/server/utils/wings/nodesStore'
import type { StoredWingsNode } from '#shared/types/wings'

export interface ServerRequestContext {
  user: SessionUser
  server: typeof tables.servers.$inferSelect
  permissions: string[]
  isAdmin: boolean
  isOwner: boolean
  subuserPermissions: string[] | null
  node: StoredWingsNode | null
  nodeConnection: {
    tokenId: string
    tokenSecret: string
    combinedToken: string
  } | null
}

export interface ServerAccessOptions {
  identifier?: string
  requireNode?: boolean
  requiredPermissions?: string[]
  fallbackPermissions?: string[]
}

export async function resolveServerRequest(
  event: H3Event,
  options: ServerAccessOptions = {},
): Promise<ServerRequestContext> {
  const identifier = options.identifier ?? event.context.params?.id

  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  const db = useDrizzle()
  let subuserPermissions: string[] | null = null

  if (!isAdmin && !isOwner) {
    const subuser = db
      .select({ permissions: tables.serverSubusers.permissions })
      .from(tables.serverSubusers)
      .where(and(
        eq(tables.serverSubusers.serverId, server.id),
        eq(tables.serverSubusers.userId, user.id || ''),
      ))
      .limit(1)
      .get()

    if (!subuser) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    subuserPermissions = normalizePermissionPayload(subuser.permissions)
  }

  const permissions = await getUserPermissions(user.id || '', server.id)

  const requiredPermissions = options.requiredPermissions ?? options.fallbackPermissions ?? []

  if (requiredPermissions.length > 0) {
    const permissionsArray = permissions as string[]
    const missing = requiredPermissions.filter(permission => !permissionsArray.includes(permission))
    if (missing.length > 0) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: `Missing permissions: ${missing.join(', ')}` })
    }
  }

  const requireNode = options.requireNode !== false
  let node: StoredWingsNode | null = null
  let nodeConnection: ServerRequestContext['nodeConnection'] = null

  if (requireNode) {
    const queryNodeIdRaw = getQuery(event).node
    if (!server.nodeId) {
      throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
    }

    const resolved = resolveNodeConnection(queryNodeIdRaw && typeof queryNodeIdRaw === 'string' && queryNodeIdRaw.length > 0 ? queryNodeIdRaw : server.nodeId)
    node = resolved.stored
    nodeConnection = {
      tokenId: resolved.connection.tokenId,
      tokenSecret: resolved.connection.tokenSecret,
      combinedToken: resolved.connection.combinedToken,
    }
  }

  return {
    user,
    server,
    permissions: permissions as string[],
    isAdmin,
    isOwner,
    subuserPermissions,
    node,
    nodeConnection,
  }
}
