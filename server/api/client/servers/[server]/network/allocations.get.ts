import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { listServerAllocations } from '~~/server/utils/serversStore'
import { requireServerPermission } from '~~/server/utils/permission-middleware'

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
    requiredPermissions: ['allocation.read'],
  })

  const allocations = await listServerAllocations(server.id)
  const primaryAllocation = allocations.find(a => a.isPrimary)
  const additionalAllocations = allocations.filter(a => !a.isPrimary)

  return {
    data: {
      primary: primaryAllocation ? {
        id: primaryAllocation.id,
        ip: primaryAllocation.ip,
        port: primaryAllocation.port,
        ipAlias: primaryAllocation.ipAlias,
        isPrimary: primaryAllocation.isPrimary,
        notes: primaryAllocation.notes,
      } : null,
      allocations: additionalAllocations.map(alloc => ({
        id: alloc.id,
        ip: alloc.ip,
        port: alloc.port,
        ipAlias: alloc.ipAlias,
        isPrimary: alloc.isPrimary,
        notes: alloc.notes,
      })),
      allocation_limit: server.allocationLimit,
    },
  }
})
