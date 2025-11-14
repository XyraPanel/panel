import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

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
  const allocations = db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id))
    .all()

  return {
    data: allocations.map(alloc => ({
      id: alloc.id,
      ip: alloc.ip,
      port: alloc.port,
      ip_alias: alloc.ipAlias,
      is_primary: alloc.isPrimary,
      notes: alloc.notes,
      assigned: true,
    })),
  }
})
