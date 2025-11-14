
export default defineEventHandler(async (event) => {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const uuid = getRouterParam(event, 'uuid')

  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const { useDrizzle, tables, eq } = await import('../../../../utils/drizzle')
  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .get()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const node = db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId!))
    .get()

  if (!node) {
    throw createError({
      statusCode: 404,
      message: 'Node not found',
    })
  }

  const { requireServerPermission } = await import('../../../../utils/api-helpers')
  await requireServerPermission(event, server.id, 'control.console')

  const { getWingsClientForServer } = await import('../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {
    const wsData = await client.getWebSocketToken(uuid)

    return {
      data: {
        token: wsData.token,
        socket: wsData.socket || `wss://${node.fqdn}:${node.daemonListen}/api/servers/${uuid}/ws`,
      },
    }
  } catch (error) {
    console.error('Failed to get WebSocket token:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to get WebSocket token',
    })
  }
})
