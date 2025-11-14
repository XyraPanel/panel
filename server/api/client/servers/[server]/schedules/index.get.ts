import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

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

  const db = useDrizzle()
  const schedules = db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.serverId, server.id))
    .all()

  const schedulesWithTasks = await Promise.all(
    schedules.map(async (schedule) => {
      const tasks = db
        .select()
        .from(tables.serverScheduleTasks)
        .where(eq(tables.serverScheduleTasks.scheduleId, schedule.id))
        .orderBy(tables.serverScheduleTasks.sequenceId)
        .all()

      return {
        id: schedule.id,
        name: schedule.name,
        cron: schedule.cron,
        is_active: schedule.enabled,
        is_processing: false,
        only_when_online: false,
        last_run_at: schedule.lastRunAt,
        next_run_at: schedule.nextRunAt,
        created_at: schedule.createdAt,
        updated_at: schedule.updatedAt,
        tasks: tasks.map(task => ({
          id: task.id,
          sequence_id: task.sequenceId,
          action: task.action,
          payload: task.payload,
          time_offset: task.timeOffset,
          is_queued: task.isQueued,
          continue_on_failure: task.continueOnFailure,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
        })),
      }
    })
  )

  return {
    data: schedulesWithTasks,
  }
})
