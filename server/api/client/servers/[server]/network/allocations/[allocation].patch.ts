import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

interface UpdateAllocationPayload {
  notes?: string
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const allocationId = getRouterParam(event, 'allocation')

  if (!serverId || !allocationId) {
    throw createError({
      statusCode: 400,
      message: 'Server and allocation identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const body = await readBody<UpdateAllocationPayload>(event)

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

  const updated = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, allocationId))
    .get()

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
