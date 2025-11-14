
export default defineEventHandler(async (event) => {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const body = await readBody(event)
  const { serverId, startOnCompletion = true } = body

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const { useDrizzle, tables, eq } = await import('../../../utils/drizzle')
  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

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

  const { requireAdmin } = await import('../../../utils/api-helpers')
  await requireAdmin(event)

  const { getWingsClientForServer } = await import('../../../utils/wings-client')
  const { client } = await getWingsClientForServer(server.uuid)

  try {

    const limits = db
      .select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, server.id))
      .get()

    const allAllocations = db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, server.id))
      .all() || []

    const primaryAllocation = allAllocations.find(a => a.isPrimary)

    const egg = db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, server.eggId!))
      .get()

    const config = {
      uuid: server.uuid,
      suspended: server.suspended || false,
      environment: {},
      invocation: egg?.startup || '',
      skip_egg_scripts: false,
      start_on_completion: startOnCompletion,
      build: {
        memory_limit: limits?.memory || 512,
        swap: limits?.swap || 0,
        io_weight: limits?.io || 500,
        cpu_limit: limits?.cpu || 100,
        threads: limits?.threads || null,
        disk_space: limits?.disk || 1024,
        oom_disabled: limits?.oomDisabled || true,
      },
      container: {
        image: server.image || egg?.dockerImage || 'ghcr.io/pterodactyl/yolks:java_17',
        oom_disabled: limits?.oomDisabled || true,
        requires_rebuild: false,
      },
      allocations: {
        default: primaryAllocation
          ? {
              ip: primaryAllocation.ip,
              port: primaryAllocation.port,
            }
          : {
              ip: '0.0.0.0',
              port: 25565,
            },
        mappings: {},
      },
      mounts: [],
      egg: {
        id: server.eggId || '',
        file_denylist: [],
      },
    }

    await client.createServer(server.uuid, config)

    return {
      success: true,
      message: 'Server created on Wings successfully',
    }
  } catch (error) {
    console.error('Failed to create server on Wings:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to create server on Wings',
    })
  }
})
