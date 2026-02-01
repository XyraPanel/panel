import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { updateAllocationSchema } from '#shared/schema/server/subusers'
import { invalidateServerCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')
  const allocationId = getRouterParam(event, 'allocation')

  if (!serverIdentifier || !allocationId) {
    throw createError({
      statusCode: 400,
      message: 'Server and allocation identifiers are required',
    })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.update'],
    allowOwner: true,
    allowAdmin: true,
  })

  const body = await readValidatedBodyWithLimit(
    event,
    updateAllocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

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

  db.update(tables.serverAllocations)
    .set({
      notes: body.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, allocationId))
    .run()

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.allocation.updated',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationId,
    },
  })

  const updated = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, allocationId))
    .get()

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    data: {
      id: updated!.id,
      ip: updated!.ip,
      port: updated!.port,
      ipAlias: updated!.ipAlias ?? null,
      isPrimary: Boolean(updated!.isPrimary),
      notes: updated!.notes,
    },
  }
})
