import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  if (!server.nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Server has no node assigned',
    })
  }

  const [node] = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .limit(1)
    .all()

  if (!node) {
    throw createError({
      statusCode: 404,
      message: 'Server node not found',
    })
  }

  try {

    const baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonListen}`
    await fetch(`${baseUrl}/api/servers/${server.uuid}/reinstall`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${node.tokenIdentifier}.${node.tokenSecret}`,
        'Accept': 'application/json',
      },
    })

    return {
      success: true,
      message: 'Server reinstall initiated',
    }
  }
  catch (error) {
    const err = error as Error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to trigger server reinstall: ${err.message}`,
    })
  }
})
