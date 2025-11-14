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

  try {
    const { executeScheduledTask } = await import('../../../../../../utils/task-scheduler')

    const tasks = await db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
      .all()

    for (const task of tasks.sort((a, b) => a.sequenceId - b.sequenceId)) {

      if (task.timeOffset > 0) {
        await new Promise(resolve => setTimeout(resolve, task.timeOffset * 1000))
      }

      await executeScheduledTask(scheduleId, task.id)
    }
  } catch (error) {
    console.error('Failed to execute schedule:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to execute schedule tasks',
    })
  }

  db.update(tables.serverSchedules)
    .set({
      lastRunAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tables.serverSchedules.id, scheduleId))
    .run()

  return {
    success: true,
    message: 'Schedule execution triggered',
  }
})
