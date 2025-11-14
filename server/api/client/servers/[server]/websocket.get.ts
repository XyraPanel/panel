import { getServerSession } from '#auth'
import { getServerWithAccess, getNodeForServer } from '~~/server/utils/server-helpers'
import { generateWebSocketCredentials } from '~~/server/utils/wings/jwt'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server, user } = await getServerWithAccess(serverId, session)

  const node = await getNodeForServer(server.nodeId)

  try {
    const credentials = await generateWebSocketCredentials(
      {
        id: node.id,
        baseUrl: node.baseUrl,
        tokenSecret: node.tokenSecret,
        scheme: node.scheme,
        fqdn: node.fqdn,
        daemonListen: node.daemonListen,
      },
      {
        uuid: server.uuid,
        id: server.id,
      },
      {
        id: user.id,
        uuid: user.id,
      }
    )

    return {
      data: credentials,
    }
  } catch (error) {
    console.error('Failed to generate WebSocket credentials:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to generate WebSocket credentials',
    })
  }
})
