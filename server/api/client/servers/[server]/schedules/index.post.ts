import { randomUUID } from 'crypto'
import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

interface CreateSchedulePayload {
  name: string
  cron: {
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

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const body = await readBody<CreateSchedulePayload>(event)

  const cronString = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`

  const db = useDrizzle()
  const scheduleId = randomUUID()
  const now = new Date()

  db.insert(tables.serverSchedules)
    .values({
      id: scheduleId,
      serverId: server.id,
      name: body.name,
      cron: cronString,
      action: 'none',
      enabled: body.is_active ?? true,
      nextRunAt: null,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const schedule = db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .get()

  return {
    data: {
      id: schedule!.id,
      name: schedule!.name,
      cron: schedule!.cron,
      is_active: schedule!.enabled,
      is_processing: false,
      only_when_online: false,
      last_run_at: schedule!.lastRunAt,
      next_run_at: schedule!.nextRunAt,
      created_at: schedule!.createdAt,
      updated_at: schedule!.updatedAt,
      tasks: [],
    },
  }
})
