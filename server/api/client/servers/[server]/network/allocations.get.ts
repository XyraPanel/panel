import { getServerWithAccess } from '#server/utils/server-helpers'
import { listServerAllocations } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { requireAccountUser } from '#server/utils/security'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.read'],
    allowOwner: true,
    allowAdmin: true,
  })

  const allocations = await listServerAllocations(server.id)
  const normalizeAllocation = (allocation: typeof allocations[number]) => ({
    id: allocation.id,
    ip: allocation.ip,
    port: allocation.port,
    ipAlias: allocation.ipAlias ?? null,
    isPrimary: Boolean(allocation.isPrimary),
    notes: allocation.notes ?? null,
  })

  const mappedAllocations = allocations.map(normalizeAllocation)
  const primaryAllocation = mappedAllocations.find(a => a.isPrimary) ?? null
  const additionalAllocations = mappedAllocations.filter(a => !a.isPrimary)

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.network.allocations.viewed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationCount: mappedAllocations.length,
      hasPrimary: Boolean(primaryAllocation),
    },
  })

  return {
    data: {
      primary: primaryAllocation,
      allocations: additionalAllocations,
      allocation_limit: server.allocationLimit ?? null,
    },
  }
})

