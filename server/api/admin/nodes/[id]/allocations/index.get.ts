import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const nodeId = getRouterParam(event, 'id')
  if (!nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Node ID is required',
    })
  }

  const db = useDrizzle()
  const allocations = db.select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.nodeId, nodeId))
    .all()

  return {
    data: allocations,
  }
})
