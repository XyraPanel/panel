import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { invalidateServerCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { requireAccountUser } from '#server/utils/security'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')
  const allocationId = getRouterParam(event, 'id')

  if (!serverIdentifier) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  if (!allocationId) {
    throw createError({
      statusCode: 400,
      message: 'Allocation identifier is required',
    })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.delete'],
    allowOwner: true,
    allowAdmin: true,
  })

  if (!server.allocationLimit) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete allocations for a server without an allocation limit',
    })
  }

  const db = useDrizzle()

  const allocation = db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.id, allocationId),
        eq(tables.serverAllocations.serverId, server.id)
      )
    )
    .get()

  if (!allocation) {
    throw createError({
      statusCode: 404,
      message: 'Allocation not found',
    })
  }

  if (allocation.isPrimary) {
    throw createError({
      statusCode: 400,
      message: 'Cannot delete the primary allocation for a server',
    })
  }

  db.update(tables.serverAllocations)
    .set({
      serverId: null,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, allocationId))
    .run()

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.allocation.deleted',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationId: allocation.id,
      ip: allocation.ip,
      port: allocation.port,
    },
  })

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    data: {
      success: true,
    },
  }
})
