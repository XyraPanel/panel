import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { invalidateServerCaches } from '~~/server/utils/serversStore'
import { requireServerPermission } from '~~/server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const allocationId = getRouterParam(event, 'id')

  if (!serverId) {
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

  const { server } = await getServerWithAccess(serverId, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.delete'],
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

  await recordAuditEventFromRequest(event, {
    actor: session?.user?.email || session?.user?.id || 'unknown',
    actorType: 'user',
    action: 'server.allocation.deleted',
    targetType: 'server',
    targetId: server.id,
    metadata: {
      allocationId: allocation.id,
      ip: allocation.ip,
      port: allocation.port,
    },
  })

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return { success: true }
})
