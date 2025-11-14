import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const scheduleId = getRouterParam(event, 'schedule')

  if (!serverId || !scheduleId) {
    throw createError({
      statusCode: 400,
      message: 'Server and schedule identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const schedule = db
    .select()
    .from(tables.serverSchedules)
    .where(
      and(
        eq(tables.serverSchedules.id, scheduleId),
        eq(tables.serverSchedules.serverId, server.id)
      )
    )
    .get()

  if (!schedule) {
    throw createError({
      statusCode: 404,
      message: 'Schedule not found',
    })
  }

  db.delete(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .run()

  return {
    success: true,
  }
})
