import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.SERVERS, ADMIN_ACL_PERMISSIONS.READ)

  const identifier = getRouterParam(event, 'id')

  if (!identifier) {
    throw createError({ statusCode: 400, message: 'Server ID required' })
  }

  const db = useDrizzle()
  const { findServerByIdentifier } = await import('#server/utils/serversStore')
  const foundServer = await findServerByIdentifier(identifier)

  if (!foundServer) {
    throw createError({ statusCode: 404, message: 'Server not found' })
  }

  const result = db
    .select({
      server: tables.servers,
      owner: tables.users,
      node: tables.wingsNodes,
      egg: tables.eggs,
      nest: tables.nests,
      allocation: tables.serverAllocations,
    })
    .from(tables.servers)
    .leftJoin(tables.users, eq(tables.servers.ownerId, tables.users.id))
    .leftJoin(tables.wingsNodes, eq(tables.servers.nodeId, tables.wingsNodes.id))
    .leftJoin(tables.eggs, eq(tables.servers.eggId, tables.eggs.id))
    .leftJoin(tables.nests, eq(tables.servers.nestId, tables.nests.id))
    .leftJoin(tables.serverAllocations, eq(tables.servers.allocationId, tables.serverAllocations.id))
    .where(eq(tables.servers.id, foundServer.id))
    .get()

  if (!result) {
    throw createError({ statusCode: 404, message: 'Server not found' })
  }

  const { server, owner, node, egg, nest, allocation } = result

  const limits = db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .get()

  const allocations = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  const databases = db
    .select()
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, server.id))
    .all()

  const mounts = db
    .select()
    .from(tables.mounts)
    .innerJoin(tables.mountServer, eq(tables.mounts.id, tables.mountServer.mountId))
    .where(eq(tables.mountServer.serverId, server.id))
    .all()

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.viewed',
    targetType: 'server',
    targetId: server.id,
    metadata: {
      serverUuid: server.uuid,
    },
  })

  return {
    data: {
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      externalId: server.externalId,
      name: server.name,
      description: server.description,
      status: server.status,
      suspended: server.suspended,
      skipScripts: server.skipScripts ?? false,
      ownerId: server.ownerId,
      nodeId: server.nodeId,
      allocationId: server.allocationId,
      nestId: server.nestId,
      eggId: server.eggId,
      startup: server.startup,
      image: server.dockerImage || server.image,
      allocationLimit: server.allocationLimit ?? null,
      databaseLimit: server.databaseLimit ?? null,
      backupLimit: server.backupLimit ?? 3,
      installedAt: server.installedAt instanceof Date ? server.installedAt.toISOString() : server.installedAt,
      createdAt: server.createdAt instanceof Date ? server.createdAt.toISOString() : server.createdAt,
      updatedAt: server.updatedAt instanceof Date ? server.updatedAt.toISOString() : server.updatedAt,
      owner: owner ? {
        id: owner.id,
        username: owner.username,
        email: owner.email,
      } : null,
      node: node ? {
        id: node.id,
        uuid: node.uuid,
        name: node.name,
        fqdn: node.fqdn,
      } : null,
      egg: egg ? {
        id: egg.id,
        uuid: egg.uuid,
        name: egg.name,
      } : null,
      nest: nest ? {
        id: nest.id,
        uuid: nest.uuid,
        name: nest.name,
      } : null,
      allocation: allocation ? {
        id: allocation.id,
        ip: allocation.ip,
        port: allocation.port,
      } : null,
      allocations: allocations.map(a => ({
        id: a.id,
        ip: a.ip,
        port: a.port,
        isPrimary: Boolean(a.isPrimary),
      })),
      limits: limits ? {
        cpu: limits.cpu,
        memory: limits.memory,
        disk: limits.disk,
        swap: limits.swap,
        io: limits.io,
        threads: limits.threads,
        oomDisabled: limits.oomDisabled,
      } : null,
      databases,
      mounts: mounts.map(m => m.mounts),
    },
  }
})
