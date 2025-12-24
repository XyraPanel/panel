import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { listServerAllocations } from '~~/server/utils/serversStore'

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

  const allocations = await listServerAllocations(server.id)

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
