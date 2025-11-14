import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const serverId = getRouterParam(event, 'id')

  if (!serverId) {
    throw createError({ statusCode: 400, message: 'Server ID required' })
  }

  const db = useDrizzle()

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
    .where(eq(tables.servers.id, serverId))
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

  return {
    data: {
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      external_id: server.externalId,
      name: server.name,
      description: server.description,
      status: server.status,
      suspended: server.suspended,
      startup: server.startup,
      docker_image: server.dockerImage || server.image,
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
        is_primary: a.isPrimary,
      })),
      limits: limits ? {
        cpu: limits.cpu,
        memory: limits.memory,
        disk: limits.disk,
        swap: limits.swap,
        io: limits.io,
      } : null,
      created_at: server.createdAt,
      updated_at: server.updatedAt,
    },
  }
})
