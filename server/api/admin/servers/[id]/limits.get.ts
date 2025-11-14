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

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const db = useDrizzle()
  const [limits] = db.select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1)
    .all()

  if (!limits) {
    throw createError({
      statusCode: 404,
      message: 'Server limits not found',
    })
  }

  return {
    data: limits,
  }
})
