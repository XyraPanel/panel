import { createError } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { generateWingsJWT } from '~~/server/utils/wings/jwt'

interface WebSocketToken {
  token: string
  socket: string
}

export default defineEventHandler(async (event): Promise<WebSocketToken> => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['websocket.connect'],
  })

  if (!context.node || !context.nodeConnection) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Node not available',
      message: 'Server has no resolved Wings node',
    })
  }

  const { node, nodeConnection, user, server, permissions } = context

  const token = await generateWingsJWT(
    {
      tokenSecret: nodeConnection.tokenSecret,
      baseUrl: node.baseURL,
    },
    {
      server: { uuid: server.uuid },
      user: user.id ? { id: user.id, uuid: user.id } : undefined,
      permissions,
      identifiedBy: `${user.id ?? 'anonymous'}:${server.uuid}`,
      expiresIn: 900,
    },
  )

  const protocol = node.scheme === 'https' ? 'wss' : 'ws'
  const socketUrl = `${protocol}://${node.fqdn}:${node.daemonListen}/api/servers/${server.uuid}/ws`

  return {
    token,
    socket: socketUrl,
  }
})
