import { getServerSession } from '~~/server/utils/session'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { invalidateScheduleCaches } from '~~/server/utils/serversStore'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const scheduleId = getRouterParam(event, 'schedule')
  const taskId = getRouterParam(event, 'task')

  if (!serverId || !scheduleId || !taskId) {
    throw createError({
      statusCode: 400,
      message: 'Server, schedule, and task identifiers are required',
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

  const task = db
    .select()
    .from(tables.serverScheduleTasks)
    .where(
      and(
        eq(tables.serverScheduleTasks.id, taskId),
        eq(tables.serverScheduleTasks.scheduleId, scheduleId)
      )
    )
    .get()

  if (!task) {
    throw createError({
      statusCode: 404,
      message: 'Task not found',
    })
  }

  db.delete(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .run()

  await invalidateScheduleCaches({ serverId: server.id, scheduleId })

  return {
    success: true,
  }
})
