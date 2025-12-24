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
    object: 'list',
    data: allocations.map(alloc => ({
      object: 'allocation',
      attributes: {
        id: alloc.id,
        ip: alloc.ip,
        ip_alias: alloc.ipAlias,
        port: alloc.port,
        notes: alloc.notes,
        is_default: alloc.id === server.allocationId,
      },
    })),
  }
})
