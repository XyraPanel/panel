import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and, isNull } from '~~/server/utils/drizzle'
import { invalidateServerCaches } from '~~/server/utils/serversStore'
import { requireServerPermission } from '~~/server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

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

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.create'],
  })

  if (!server.allocationLimit) {
    throw createError({
      statusCode: 400,
      message: 'Server does not have an allocation limit set',
    })
  }

  const db = useDrizzle()
  const currentAllocations = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  if (currentAllocations.length >= server.allocationLimit) {
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

  const primaryAllocation = currentAllocations.find(a => a.isPrimary)
  if (!primaryAllocation) {
    throw createError({
      statusCode: 400,
      message: 'Server has no primary allocation',
    })
  }

  const allocation = db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.nodeId, server.nodeId!),
        eq(tables.serverAllocations.ip, primaryAllocation.ip),
        isNull(tables.serverAllocations.serverId)
      )
    )
    .limit(1)
    .get()

  if (!allocation) {
    throw createError({
      statusCode: 400,
      message: 'No available allocations on this node. Please contact an administrator to add more ports.',
    })
  }

  db.update(tables.serverAllocations)
    .set({
      serverId: server.id,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, allocation.id))
    .run()

  const updated = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, allocation.id))
    .get()

  if (!updated) {
    throw createError({
      statusCode: 500,
      message: 'Failed to retrieve updated allocation',
    })
  }

  await recordAuditEventFromRequest(event, {
    actor: session?.user?.email || session?.user?.id || 'unknown',
    actorType: 'user',
    action: 'server.allocation.created',
    targetType: 'server',
    targetId: server.id,
    metadata: {
      allocationId: updated!.id,
      ip: updated!.ip,
      port: updated!.port,
    },
  })

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
