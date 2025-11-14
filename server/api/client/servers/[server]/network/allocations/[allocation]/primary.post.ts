import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

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

  const db = useDrizzle()
  const [allocation] = db.select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.id, allocationId),
        eq(tables.serverAllocations.serverId, server.id)
      )
    )
    .limit(1)
    .all()

  if (!allocation) {
    throw createError({
      statusCode: 404,
      message: 'Allocation not found',
    })
  }

  db.update(tables.servers)
    .set({
      allocationId,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  return {
    object: 'allocation',
    attributes: {
      id: allocation.id,
      ip: allocation.ip,
      ip_alias: allocation.ipAlias,
      port: allocation.port,
      notes: allocation.notes,
      is_default: true,
    },
  }
})
