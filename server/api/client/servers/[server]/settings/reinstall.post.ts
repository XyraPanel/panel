import { getServerSession } from '#auth'
import { getServerWithAccess, getNodeForServer } from '~~/server/utils/server-helpers'
import { createWingsClient } from '~~/server/utils/wings/client'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

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

  if (server.suspended) {
    throw createError({
      statusCode: 403,
      message: 'Server is suspended',
    })
  }

  const db = useDrizzle()
  db.update(tables.servers)
    .set({
      status: 'installing',
      installedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  const node = await getNodeForServer(server.nodeId)

  try {
    const wingsClient = createWingsClient({
      fqdn: node.fqdn,
      scheme: node.scheme,
      daemonListen: node.daemonListen,
      tokenId: node.tokenIdentifier,
      tokenSecret: node.tokenSecret,
    })

    const response = await fetch(`${wingsClient}/servers/${server.uuid}/reinstall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to trigger reinstall')
    }

    return {
      success: true,
      message: 'Server reinstall initiated',
    }
  } catch (error) {
    console.error('Failed to trigger reinstall on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to trigger reinstall',
    })
  }
})
