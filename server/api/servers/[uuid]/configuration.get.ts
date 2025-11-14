import { createError } from 'h3'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import type { WingsServerConfiguration } from '#shared/types/wings-config'

export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid')
  if (!uuid) {
    throw createError({
      statusCode: 400,
      message: 'Server UUID is required',
    })
  }

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const [limits] = db.select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1)
    .all()

  let primaryAllocation = null
  if (server.allocationId) {
    const [alloc] = db.select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, server.allocationId))
      .limit(1)
      .all()
    primaryAllocation = alloc
  }

  const allocations = db.select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  const envVars = db.select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id))
    .all()

  let egg = null
  if (server.eggId) {
    const [eggData] = db.select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, server.eggId))
      .limit(1)
      .all()
    egg = eggData
  }

  const environment: Record<string, string> = {}
  for (const envVar of envVars) {
    environment[envVar.key] = envVar.value
  }

  const allocationMappings: Record<string, number[]> = {}
  for (const alloc of allocations) {
    if (!allocationMappings[alloc.ip]) {
      allocationMappings[alloc.ip] = []
    }
    const mapping = allocationMappings[alloc.ip]
    if (mapping) {
      mapping.push(alloc.port)
    }
  }

  const config: WingsServerConfiguration = {
    uuid: server.uuid,
    meta: {
      name: server.name,
      description: server.description || '',
    },
    suspended: server.suspended,
    invocation: server.startup || '',
    skip_egg_scripts: server.skipScripts,
    environment,
    labels: {
      Service: 'XyraPanel',
      ContainerType: 'server_process',
    },
    allocations: {
      force_outgoing_ip: false,
      default: {
        ip: primaryAllocation?.ip || '0.0.0.0',
        port: primaryAllocation?.port || 25565,
      },
      mappings: allocationMappings,
    },
    build: {
      memory_limit: limits?.memory || 512,
      swap: limits?.swap || 0,
      io_weight: limits?.io || 500,
      cpu_limit: limits?.cpu || 0,
      threads: limits?.threads || '',
      disk_space: limits?.disk || 1024,
      oom_disabled: limits?.oomDisabled ?? true,
    },
    crash_detection_enabled: true,
    mounts: [],
    egg: {
      id: egg?.uuid || '',
      file_denylist: [],
    },
    container: {
      image: server.image || egg?.dockerImage || 'ghcr.io/pterodactyl/yolks:java_21',
    },
  }

  return config
})
