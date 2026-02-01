import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { invalidateScheduleCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { clientUpdateScheduleSchema } from '#shared/schema/server/operations'

function calculateNextRun(cronExpression: string): Date {
  const now = new Date()
  const [minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = cronExpression.split(' ')
  
  const nextRun = new Date(now)
  nextRun.setSeconds(0)
  nextRun.setMilliseconds(0)
  
  const targetMinute = minute === '*' ? null : parseInt(minute)
  const targetHour = hour === '*' ? null : parseInt(hour)
  const targetDay = day === '*' ? null : parseInt(day)
  const targetMonth = month === '*' ? null : parseInt(month)
  const targetWeekday = weekday === '*' ? null : parseInt(weekday)
  
  let found = false
  let attempts = 0
  const maxAttempts = 366
  
  while (!found && attempts < maxAttempts) {
    attempts++
    
    if (targetMinute !== null) {
      nextRun.setMinutes(targetMinute)
    } else {
      nextRun.setMinutes(nextRun.getMinutes() + 1)
    }
    
    if (targetHour !== null) {
      nextRun.setHours(targetHour)
    }
    
    if (targetDay !== null) {
      nextRun.setDate(targetDay)
    }
    
    if (targetMonth !== null) {
      nextRun.setMonth(targetMonth - 1)
    }
    
    if (nextRun > now) {
      const matchesMinute = targetMinute === null || nextRun.getMinutes() === targetMinute
      const matchesHour = targetHour === null || nextRun.getHours() === targetHour
      const matchesDay = targetDay === null || nextRun.getDate() === targetDay
      const matchesMonth = targetMonth === null || nextRun.getMonth() === targetMonth - 1
      const matchesWeekday = targetWeekday === null || nextRun.getDay() === targetWeekday
      
      if (matchesMinute && matchesHour && matchesDay && matchesMonth && matchesWeekday) {
        found = true
      } else {
        nextRun.setMinutes(nextRun.getMinutes() + 1)
      }
    } else {
      nextRun.setMinutes(nextRun.getMinutes() + 1)
    }
  }
  
  return nextRun
}

type ServerScheduleUpdate = typeof tables.serverSchedules.$inferInsert

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')
  const scheduleId = getRouterParam(event, 'schedule')

  if (!serverId || !scheduleId) {
    throw createError({
      status: 400,
      message: 'Server and schedule identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.update'],
  })

  const body = await readValidatedBodyWithLimit(event, clientUpdateScheduleSchema, BODY_SIZE_LIMITS.SMALL)

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
      status: 404,
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
    const cronString = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`
    updates.cron = cronString
    updates.nextRunAt = calculateNextRun(cronString)
  }

  if (body.is_active !== undefined) {
    updates.enabled = body.is_active
  }

  await db.update(tables.serverSchedules)
    .set(updates)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .run()

  const updated = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .get()

  await invalidateScheduleCaches({ serverId: server.id, scheduleId })

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.id,
    actorType: 'user',
    action: 'server.schedule.update',
    targetType: 'server',
    targetId: server.id,
    metadata: { scheduleId, updates: Object.keys(updates) },
  })

  const tasks = await db
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
