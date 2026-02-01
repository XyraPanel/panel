import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { serverManager } from '#server/utils/server-manager'
import { backupManager } from '#server/utils/backup-manager'
import { recordAuditEvent } from '#server/utils/audit'
import { debugLog, debugError } from '#server/utils/logger'

function parseNextRun(cronExpression: string): Date {
  const now = new Date()
  const [minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = cronExpression.trim().split(/\s+/)
  
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

export default defineTask({
  meta: {
    name: 'scheduler:process',
    description: 'Process scheduled server tasks',
  },
  async run({ payload: _payload, context: _context }) {
    const db = useDrizzle()
    const now = new Date()
    const processedSchedules: string[] = []
    const errors: string[] = []

    try {
      debugLog(`[${now.toISOString()}] Processing scheduled tasks...`)

      const schedules = await db
        .select()
        .from(tables.serverSchedules)
        .where(eq(tables.serverSchedules.enabled, true))
        .all()

      for (const schedule of schedules) {
        try {
          const nextRun = parseNextRun(schedule.cron)
          const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null
          
          const timeSinceLastRun = lastRun ? now.getTime() - lastRun.getTime() : Infinity
          const isOverdue = !lastRun || timeSinceLastRun > 65000
          
          if (isOverdue && nextRun <= now) {
            await processSchedule(schedule.id, db)
            processedSchedules.push(schedule.id)
          }
        } catch (scheduleError) {
          const errorMsg = `Schedule ${schedule.id} failed: ${scheduleError instanceof Error ? scheduleError.message : 'Unknown error'}`
          debugError(errorMsg)
          errors.push(errorMsg)
        }
      }

      const result = {
        processedAt: now.toISOString(),
        schedulesProcessed: processedSchedules.length,
        totalSchedules: schedules.length,
        errors: errors.length,
        processedScheduleIds: processedSchedules,
      }

      debugLog(`[${now.toISOString()}] Task processing complete:`, result)
      return { result }

    } catch (error) {
      const errorMsg = `Scheduler task failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      console.error(errorMsg)
      throw new Error(errorMsg)
    }
  },
})

async function processSchedule(scheduleId: string, db: ReturnType<typeof useDrizzle>) {
  const runningTasks = new Map<string, boolean>()
  
  if (runningTasks.has(scheduleId)) {
    debugLog(`Schedule ${scheduleId} is already running, skipping...`)
    return
  }

  runningTasks.set(scheduleId, true)
  const executedAt = new Date()

  try {
    const schedule = await db
      .select()
      .from(tables.serverSchedules)
      .where(eq(tables.serverSchedules.id, scheduleId))
      .get()

    if (!schedule || !schedule.enabled) {
      return
    }

    const tasks = await db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
      .orderBy(tables.serverScheduleTasks.sequenceId)
      .all()

    if (tasks.length === 0) {
      debugLog(`No tasks found for schedule ${scheduleId}`)
      return
    }

    const server = await db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, schedule.serverId))
      .get()

    if (!server) {
      throw new Error('Server not found')
    }

    debugLog(`Executing ${tasks.length} tasks for schedule "${schedule.name}" on server ${server.uuid}`)

    let allTasksSucceeded = true

    for (const task of tasks) {
      if (task.timeOffset > 0) {
        debugLog(`Waiting ${task.timeOffset}s before executing task ${task.id}`)
        await new Promise(resolve => setTimeout(resolve, task.timeOffset * 1000))
      }

      try {
        await executeTask(task, server, schedule)
        debugLog(`Task ${task.id} (${task.action}) completed successfully`)
      } catch (taskError) {
        const errorMsg = `Task ${task.id} failed: ${taskError instanceof Error ? taskError.message : 'Unknown error'}`
        console.error(errorMsg)
        allTasksSucceeded = false

        if (!task.continueOnFailure) {
          debugLog(`Task ${task.id} failed and continueOnFailure is false, stopping execution`)
          break
        }
      }
    }

    const nextRun = parseNextRun(schedule.cron)
    
    await db
      .update(tables.serverSchedules)
      .set({
        lastRunAt: executedAt,
        nextRunAt: nextRun,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverSchedules.id, scheduleId))
      .run()

    debugLog(`Schedule ${scheduleId} completed (success: ${allTasksSucceeded}). Next run: ${nextRun.toISOString()}`)

  } finally {
    runningTasks.delete(scheduleId)
  }
}

async function executeTask(
  task: typeof tables.serverScheduleTasks.$inferSelect,
  server: typeof tables.servers.$inferSelect,
  schedule: typeof tables.serverSchedules.$inferSelect
) {
  switch (task.action) {
    case 'command': {
      const { client } = await getWingsClientForServer(server.uuid)
      await client.sendCommand(server.uuid, task.payload || '')
      debugLog(`Command executed on ${server.uuid}: ${task.payload}`)
      break
    }

    case 'power': {
      const powerAction = task.payload as 'start' | 'stop' | 'restart' | 'kill'
      await serverManager.powerAction(server.uuid, powerAction, { skipAudit: true })
      debugLog(`Power action executed on ${server.uuid}: ${powerAction}`)
      break
    }

    case 'backup': {
      const backupName = task.payload || `scheduled-backup-${Date.now()}`
      await backupManager.createBackup(server.uuid, { 
        name: backupName,
        skipAudit: true 
      })
      debugLog(`Backup created for ${server.uuid}: ${backupName}`)
      break
    }

    default:
      throw new Error(`Unknown task action: ${task.action}`)
  }

  await recordAuditEvent({
    actor: 'system',
    actorType: 'system',
    action: `schedule.task.${task.action}`,
    targetType: 'server',
    targetId: server.id,
    metadata: {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      taskId: task.id,
      taskAction: task.action,
      taskPayload: task.payload,
    },
  })
}
