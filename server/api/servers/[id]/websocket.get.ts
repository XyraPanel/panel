import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { getUserPermissions } from '~~/server/utils/permissions'
import { generateWingsJWT } from '~~/server/utils/wings/jwt'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'
import { resolveNodeConnection } from '~~/server/utils/wings/nodesStore'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
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

  if (!isAdmin && !isOwner) {

    const subuser = await db
      .select()
      .from(tables.serverSubusers)
      .where(eq(tables.serverSubusers.serverId, server.id))
      .get()

    if (!subuser) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  if (!server.nodeId) {
    throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
  }

  const node = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .get()

  if (!node) {
    throw createError({ statusCode: 500, statusMessage: 'Node not found' })
  }

  const subuserPermissions = await getUserPermissions(user.id || '', server.id)

  const { connection } = resolveNodeConnection(node.id)

  const token = await generateWingsJWT(
    {
      tokenSecret: connection.tokenSecret,
      baseUrl: node.baseUrl,
    },
    {
      server: { uuid: server.uuid },
      user: user.id ? { id: user.id, uuid: user.id } : undefined,
      permissions: subuserPermissions,
      identifiedBy: `${user.id || ''}${server.uuid}`,
      expiresIn: 600,
    },
  )

  const protocol = node.scheme === 'https' ? 'wss' : 'ws'
  const socketUrl = `${protocol}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`

  console.info('[client][servers:websocket:credentials]', {
    serverId: server.id,
    identifier,
    actor: user.id,
    isAdmin,
    isOwner,
  })

  await recordAuditEventFromRequest(event, {
    actor: user.email || user.id || 'user',
    actorType: 'user',
    action: 'server.websocket.credentials_issued',
    targetType: 'server',
    targetId: server.id,
    metadata: {
      nodeId: node.id,
      expiresIn: 600,
      permissions: subuserPermissions,
    },
  })

  return {
    data: {
      token,
      socket: socketUrl,
    },
  }
})
