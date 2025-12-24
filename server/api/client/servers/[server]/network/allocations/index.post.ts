import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { invalidateServerCaches } from '~~/server/utils/serversStore'

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

  const db = useDrizzle()
  const existingAllocations = db.select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  if (server.allocationLimit && existingAllocations.length >= server.allocationLimit) {
    throw createError({
      statusCode: 403,
      message: 'Allocation limit reached',
    })
  }

  const availableAllocations = db.select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.nodeId, server.nodeId!))
    .all()
    .filter(alloc => !alloc.serverId)

  if (availableAllocations.length === 0) {
    throw createError({
      statusCode: 404,
      message: 'No available allocations on this node',
    })
  }

  const allocation = availableAllocations[0]

  if (!allocation) {
    throw createError({
      statusCode: 404,
      message: 'No allocation found',
    })
  }

  db.update(tables.serverAllocations)
    .set({
      serverId: server.id,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, allocation.id))
    .run()

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    object: 'allocation',
    attributes: {
      id: allocation.id,
      ip: allocation.ip,
      ip_alias: allocation.ipAlias,
      port: allocation.port,
      notes: allocation.notes,
      is_default: false,
    },
  }
})
