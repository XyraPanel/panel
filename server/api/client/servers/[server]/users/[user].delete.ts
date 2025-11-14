import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const subuserId = getRouterParam(event, 'user')

  if (!serverId || !subuserId) {
    throw createError({
      statusCode: 400,
      message: 'Server and user identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const subuser = db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(
        eq(tables.serverSubusers.id, subuserId),
        eq(tables.serverSubusers.serverId, server.id)
      )
    )
    .get()

  if (!subuser) {
    throw createError({
      statusCode: 404,
      message: 'Subuser not found',
    })
  }

  db.delete(tables.serverSubusers)
    .where(eq(tables.serverSubusers.id, subuserId))
    .run()

  return {
    success: true,
  }
})
