import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables } from '#server/utils/drizzle'
import { invalidateScheduleCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { createScheduleSchema } from '#shared/schema/server/operations'

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

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.create'],
  })

  const body = await readValidatedBodyWithLimit(event, createScheduleSchema, BODY_SIZE_LIMITS.SMALL)

  const cronString = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`

  const db = useDrizzle()
  const scheduleId = randomUUID()
  const now = new Date()

  const nextRunAt = calculateNextRun(cronString)

  await db.insert(tables.serverSchedules)
    .values({
      id: scheduleId,
      serverId: server.id,
      name: body.name,
      cron: cronString,
      action: 'none',
      enabled: body.is_active ?? true,
      nextRunAt,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const schedule = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .get()

  await invalidateScheduleCaches({ serverId: server.id, scheduleId })

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.id,
    actorType: 'user',
    action: 'server.schedule.create',
    targetType: 'server',
    targetId: server.id,
    metadata: { scheduleId, name: body.name, cron: cronString },
  })

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
