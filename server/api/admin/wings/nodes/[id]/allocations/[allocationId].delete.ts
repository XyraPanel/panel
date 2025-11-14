import { defineEventHandler, createError } from 'h3'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const { id: nodeId, allocationId } = event.context.params ?? {}

  if (!nodeId || typeof nodeId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing node id' })
  }

  if (!allocationId || typeof allocationId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing allocation id' })
  }

  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const db = useDrizzle()

  const allocation = db.select()
    .from(tables.serverAllocations)
    .where(and(
      eq(tables.serverAllocations.id, allocationId),
      eq(tables.serverAllocations.nodeId, nodeId),
    ))
    .get()

  if (!allocation) {
    throw createError({ statusCode: 404, statusMessage: 'Allocation not found' })
  }

  if (allocation.serverId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete allocation assigned to a server'
    })
  }

  db.delete(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, allocationId))
    .run()

  return {
    success: true,
    message: 'Allocation deleted successfully',
  }
})
