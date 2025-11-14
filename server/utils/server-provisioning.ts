

import { useDrizzle, tables, eq } from './drizzle'
import { getWingsClient } from './wings-client'
import type { WingsNode } from './wings-client'
import type { WingsServerConfiguration } from '#shared/types/wings-config'

export interface ServerProvisioningConfig {
  serverId: string
  serverUuid: string
  eggId: string
  nodeId: string
  allocationId: string
  environment?: Record<string, string>
}

export async function buildWingsServerConfig(
  config: ServerProvisioningConfig
): Promise<WingsServerConfiguration> {
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, config.serverId))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  const limits = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, config.serverId))
    .get()

  if (!limits) {
    throw new Error('Server limits not found')
  }

  const egg = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, config.eggId))
    .get()

  if (!egg) {
    throw new Error('Egg not found')
  }

  const allocation = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, config.allocationId))
    .get()

  if (!allocation) {
    throw new Error('Allocation not found')
  }

  const eggVars = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.eggId, config.eggId))
    .all()

  const environment: Record<string, string> = {}

  for (const eggVar of eggVars) {
    const envKey = eggVar.envVariable
    const userValue = config.environment?.[envKey]
    const defaultValue = eggVar.defaultValue

    if (userValue !== undefined) {
      environment[envKey] = String(userValue)
    } else if (defaultValue) {
      environment[envKey] = defaultValue
    }
  }

  environment.SERVER_MEMORY = String(limits.memory)
  environment.SERVER_IP = allocation.ip
  environment.SERVER_PORT = String(allocation.port)

  const wingsConfig: WingsServerConfiguration = {
    uuid: config.serverUuid,
    meta: {
      name: server.name,
      description: server.description || '',
    },
    suspended: false,
    environment,
    invocation: egg.startup || '',
    skip_egg_scripts: false,
    labels: {},
    crash_detection_enabled: true,
    build: {
      memory_limit: limits.memory ?? 512,
      swap: limits.swap ?? 0,
      io_weight: limits.io ?? 500,
      cpu_limit: limits.cpu ?? 100,
      disk_space: limits.disk ?? 1024,
      oom_disabled: true,
      threads: '',
    },
    container: {
      image: egg.dockerImage || 'ghcr.io/pterodactyl/yolks:latest',
    },
    allocations: {
      force_outgoing_ip: false,
      default: {
        ip: allocation.ip,
        port: allocation.port,
      },
      mappings: {},
    },
    mounts: [],
    egg: {
      id: egg.id,
      file_denylist: [],
    },
  }

  return wingsConfig
}

export async function provisionServerOnWings(
  config: ServerProvisioningConfig
): Promise<void> {
  const db = useDrizzle()

  const node = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, config.nodeId))
    .get()

  if (!node) {
    throw new Error('Node not found')
  }

  const wingsConfig = await buildWingsServerConfig(config)

  const wingsNode: WingsNode = {
    id: node.id,
    fqdn: node.fqdn,
    scheme: node.scheme as 'http' | 'https',
    daemonListen: node.daemonListen,
    daemonSftp: node.daemonSftp,
    daemonBase: node.daemonBase,
    tokenId: node.tokenIdentifier,
    token: node.tokenSecret,
  }

  const client = getWingsClient(wingsNode)

  await client.createServer(config.serverUuid, wingsConfig as unknown as Record<string, unknown>)

  await db
    .update(tables.servers)
    .set({
      status: 'installing',
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, config.serverId))
    .run()
}

export async function triggerServerInstallation(serverUuid: string): Promise<void> {
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverUuid))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  const node = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId!))
    .get()

  if (!node) {
    throw new Error('Node not found')
  }

  const wingsNode: WingsNode = {
    id: node.id,
    fqdn: node.fqdn,
    scheme: node.scheme as 'http' | 'https',
    daemonListen: node.daemonListen,
    daemonSftp: node.daemonSftp,
    daemonBase: node.daemonBase,
    tokenId: node.tokenIdentifier,
    token: node.tokenSecret,
  }

  const client = getWingsClient(wingsNode)

  await client.reinstallServer(serverUuid)
}

export async function checkInstallationStatus(serverUuid: string): Promise<{
  status: string
  installing: boolean
}> {
  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverUuid))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  const node = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId!))
    .get()

  if (!node) {
    throw new Error('Node not found')
  }

  const wingsNode: WingsNode = {
    id: node.id,
    fqdn: node.fqdn,
    scheme: node.scheme as 'http' | 'https',
    daemonListen: node.daemonListen,
    daemonSftp: node.daemonSftp,
    daemonBase: node.daemonBase,
    tokenId: node.tokenIdentifier,
    token: node.tokenSecret,
  }

  const client = getWingsClient(wingsNode)

  const details = await client.getServerDetails(serverUuid)

  const installing = server.status === 'installing'

  return {
    status: details.state,
    installing,
  }
}
