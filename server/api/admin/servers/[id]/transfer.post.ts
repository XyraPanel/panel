import { createError, readBody } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'
import { initiateServerTransfer, TransferError } from '~~/server/utils/transfers/initiate'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const body = await readBody(event)
  const { nodeId, allocationId, additionalAllocationIds, startOnCompletion } = body ?? {}

  if (!nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Target node ID is required',
    })
  }

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  const [targetNode] = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, nodeId))
    .limit(1)
    .all()

  if (!targetNode) {
    throw createError({
      statusCode: 404,
      message: 'Target node not found',
    })
  }

  if (server.nodeId === nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Server is already on this node',
    })
  }

  try {
    const additionalIds = Array.isArray(additionalAllocationIds)
      ? additionalAllocationIds
      : typeof additionalAllocationIds === 'string'
        ? additionalAllocationIds.split(',').map(id => id.trim()).filter(Boolean)
        : []

    const result = await initiateServerTransfer(serverId, nodeId, {
      allocationId: typeof allocationId === 'string' && allocationId.length > 0 ? allocationId : undefined,
      additionalAllocationIds: additionalIds,
      startOnCompletion: Boolean(startOnCompletion),
    })

    return {
      data: result,
    }
  }
  catch (error) {
    if (error instanceof TransferError) {
      throw createError({ statusCode: error.statusCode, message: error.message })
    }

    const message = error instanceof Error ? error.message : 'Failed to initiate transfer'
    throw createError({ statusCode: 500, message })
  }
})
