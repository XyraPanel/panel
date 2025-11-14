import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

type ServerScheduleUpdate = typeof tables.serverSchedules.$inferInsert

interface UpdateSchedulePayload {
  name?: string
  cron?: {
    minute: string
    hour: string
    day_of_month: string
    month: string
    day_of_week: string
  }
  is_active?: boolean
}

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

  const body = await readBody<UpdateSchedulePayload>(event)

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

  const updates: Partial<ServerScheduleUpdate> = {
    updatedAt: new Date(),
  }

  if (body.name) {
    updates.name = body.name
  }

  if (body.cron) {
    updates.cron = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`
  }

  if (body.is_active !== undefined) {
    updates.enabled = body.is_active
  }

  db.update(tables.serverSchedules)
    .set(updates)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .run()

  const updated = db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .get()

  const tasks = db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
    .orderBy(tables.serverScheduleTasks.sequenceId)
    .all()

  return {
    data: {
      id: updated!.id,
      name: updated!.name,
      cron: updated!.cron,
      is_active: updated!.enabled,
      is_processing: false,
      only_when_online: false,
      last_run_at: updated!.lastRunAt,
      next_run_at: updated!.nextRunAt,
      created_at: updated!.createdAt,
      updated_at: updated!.updatedAt,
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
    },
  }
})
