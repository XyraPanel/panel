import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and, isNull } from '~~/server/utils/drizzle'
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
  const currentAllocations = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  if (server.allocationLimit && currentAllocations.length >= server.allocationLimit) {
    throw createError({
      statusCode: 400,
      message: 'Server has reached its allocation limit',
    })
  }

  if (!server.nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Server is not assigned to a node',
    })
  }

  const availableAllocation = db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.nodeId, server.nodeId),
        isNull(tables.serverAllocations.serverId)
      )
    )
    .limit(1)
    .get()

  if (!availableAllocation) {
    throw createError({
      statusCode: 404,
      message: 'No available allocations found on this node',
    })
  }

  db.update(tables.serverAllocations)
    .set({
      serverId: server.id,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, availableAllocation.id))
    .run()

  const updated = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, availableAllocation.id))
    .get()

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    data: {
      id: updated!.id,
      ip: updated!.ip,
      port: updated!.port,
      ip_alias: updated!.ipAlias,
      is_primary: updated!.isPrimary,
      notes: updated!.notes,
      assigned: true,
    },
  }
})
