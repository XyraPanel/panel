import { generateWingsJWT } from '#server/utils/wings/jwt'
import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { getNodeForServer } from '#server/utils/server-helpers'
import { resolveNodeConnection } from '#server/utils/wings/nodesStore'
import { recordServerActivity } from '#server/utils/server-activity'
import type { Permission } from '#shared/types/server'

interface WebSocketToken {
  token: string
  socket: string
}

export default defineEventHandler(async (event): Promise<WebSocketToken> => {
  const id = getRouterParam(event, 'server')
  if (!id || typeof id !== 'string') {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(id, accountContext.session)

  const websocketPermissions: Permission[] = ['websocket.connect']

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: websocketPermissions,
    allowOwner: true,
    allowAdmin: true,
  })

  const node = await getNodeForServer(server.nodeId)
  const { connection: nodeConnection } = resolveNodeConnection(node.id)

  if (!nodeConnection) {
    throw createError({
      status: 500,
      statusText: 'Node not available',
      message: 'Server has no resolved Wings node',
    })
  }

  const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`
  
  const token = await generateWingsJWT(
    {
      tokenSecret: nodeConnection.tokenSecret,
      baseUrl,
    },
    {
      server: { uuid: server.uuid },
      user: user.id ? { id: user.id, uuid: user.id } : undefined,
      permissions: ['*'],
      identifiedBy: `${user.id ?? 'anonymous'}:${server.uuid}`,
      expiresIn: 900,
    },
  )

  const protocol = node.scheme === 'https' ? 'wss' : 'ws'
  const socketUrl = `${protocol}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.websocket.token_issued',
    server: { id: server.id, uuid: server.uuid },
  })

  const response: WebSocketToken = {
    token,
    socket: socketUrl,
  }
  
  setResponseHeader(event, 'Content-Type', 'application/json')
  
  return response
})
