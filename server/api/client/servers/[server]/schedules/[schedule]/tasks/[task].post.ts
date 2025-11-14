import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

type ScheduleTaskUpdate = typeof tables.serverScheduleTasks.$inferInsert

interface UpdateTaskPayload {
  action?: string
  payload?: string
  time_offset?: number
  continue_on_failure?: boolean
}

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

  const body = await readBody<UpdateTaskPayload>(event)

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

  const updates: Partial<ScheduleTaskUpdate> = {
    updatedAt: new Date(),
  }

  if (body.action) updates.action = body.action
  if (body.payload !== undefined) updates.payload = body.payload
  if (body.time_offset !== undefined) updates.timeOffset = body.time_offset
  if (body.continue_on_failure !== undefined) updates.continueOnFailure = body.continue_on_failure

  db.update(tables.serverScheduleTasks)
    .set(updates)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .run()

  const updated = db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .get()

  return {
    data: {
      id: updated!.id,
      sequence_id: updated!.sequenceId,
      action: updated!.action,
      payload: updated!.payload,
      time_offset: updated!.timeOffset,
      is_queued: updated!.isQueued,
      continue_on_failure: updated!.continueOnFailure,
      created_at: updated!.createdAt,
      updated_at: updated!.updatedAt,
    },
  }
})
