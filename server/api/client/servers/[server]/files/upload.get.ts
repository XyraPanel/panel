import { getServerSession } from '#auth'
import { getServerWithAccess, getNodeForServer } from '~~/server/utils/server-helpers'
import { createWingsClient } from '~~/server/utils/wings/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const node = await getNodeForServer(server.nodeId)

  try {
    const wingsClient = createWingsClient({
      fqdn: node.fqdn,
      scheme: node.scheme,
      daemonListen: node.daemonListen,
      tokenId: node.tokenIdentifier,
      tokenSecret: node.tokenSecret,
    })

    const response = await fetch(`${wingsClient}/servers/${server.uuid}/files/upload`)

    if (!response.ok) {
      throw new Error('Failed to get upload URL')
    }

    const data = await response.json()

    return {
      attributes: {
        url: data.url || `${wingsClient}/servers/${server.uuid}/files/upload?token=${data.token}`,
      },
    }
  } catch (error) {
    console.error('Failed to get upload URL from Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to get upload URL',
    })
  }
})
