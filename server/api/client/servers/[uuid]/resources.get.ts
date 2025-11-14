
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

  const { requireServerPermission } = await import('../../../../utils/api-helpers')
  await requireServerPermission(event, server.id, 'control.console')

  const { getWingsClientForServer } = await import('../../../../utils/wings-client')
  const { client } = await getWingsClientForServer(uuid)

  try {

    const resources = await client.getServerResources(uuid)

    return {
      data: {
        state: resources.state,
        is_suspended: resources.isSuspended,
        utilization: {
          memory_bytes: resources.utilization.memory_bytes,
          memory_limit_bytes: resources.utilization.memory_limit_bytes,
          cpu_absolute: resources.utilization.cpu_absolute,
          network_rx_bytes: resources.utilization.network.rx_bytes,
          network_tx_bytes: resources.utilization.network.tx_bytes,
          uptime: resources.utilization.uptime,
          disk_bytes: resources.utilization.disk_bytes,
        },
      },
    }
  } catch (error) {
    console.error('Failed to get server resources:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to get server resources',
    })
  }
})
