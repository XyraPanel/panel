
export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid')

  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const authHeader = getHeader(event, 'Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized - Invalid or missing token',
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
      message: 'Node not found for this server',
    })
  }

  const allAllocations = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all() || []

  const primaryAllocation = allAllocations.find(a => a.isPrimary)
  const allocations = allAllocations

  const limits = db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .get()

  const egg = db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId!))
    .get()

  const environment: Record<string, string> = {
    STARTUP: egg?.startup || '',
  }

  const allocationMappings: Record<string, { ip: string; port: number }> = {}
  for (const alloc of allocations) {
    if (!alloc.isPrimary) {
      allocationMappings[`${alloc.ip}:${alloc.port}`] = {
        ip: alloc.ip,
        port: alloc.port,
      }
    }
  }

  return {
    uuid: server.uuid,
    suspended: server.suspended || false,
    environment,
    invocation: egg?.startup || '',
    skip_egg_scripts: false,
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
      mappings: allocationMappings,
    },
    mounts: [],
    egg: {
      id: server.eggId || '',
      file_denylist: [],
    },
  }
})
