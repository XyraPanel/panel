import { randomUUID } from 'crypto'
import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

interface CreateTaskPayload {
  action: string
  payload: string
  time_offset?: number
  continue_on_failure?: boolean
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

  const body = await readBody<CreateTaskPayload>(event)

  const existingTasks = db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
    .all()

  const nextSequenceId = existingTasks.length > 0
    ? Math.max(...existingTasks.map(t => t.sequenceId)) + 1
    : 1

  const taskId = randomUUID()
  const now = new Date()

  db.insert(tables.serverScheduleTasks)
    .values({
      id: taskId,
      scheduleId,
      sequenceId: nextSequenceId,
      action: body.action,
      payload: body.payload,
      timeOffset: body.time_offset ?? 0,
      continueOnFailure: body.continue_on_failure ?? false,
      isQueued: false,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const task = db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .get()

  return {
    data: {
      id: task!.id,
      sequence_id: task!.sequenceId,
      action: task!.action,
      payload: task!.payload,
      time_offset: task!.timeOffset,
      is_queued: task!.isQueued,
      continue_on_failure: task!.continueOnFailure,
      created_at: task!.createdAt,
      updated_at: task!.updatedAt,
    },
  }
})
