

import { useDrizzle, tables, eq } from './drizzle'
import { getWingsClientForServer } from './wings-client'

export interface ScheduleTask {
  id: string
  action: 'command' | 'power' | 'backup'
  payload: string
  timeOffset: number
  sequenceId: number
}

export async function executeScheduledTask(
  scheduleId: string,
  taskId: string
): Promise<void> {
  const db = useDrizzle()

  const task = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .get()

  if (!task) {
    throw new Error('Task not found')
  }

  const schedule = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .get()

  if (!schedule) {
    throw new Error('Schedule not found')
  }

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, schedule.serverId))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  const { client } = await getWingsClientForServer(server.uuid)

  switch (task.action) {
    case 'command':
      if (task.payload) {
        await client.sendCommand(server.uuid, task.payload)
      }
      break

    case 'power':
      await client.sendPowerAction(
        server.uuid,
        task.payload as 'start' | 'stop' | 'restart' | 'kill'
      )
      break

    case 'backup':
      await client.createBackup(server.uuid, `Scheduled backup - ${new Date().toISOString()}`)
      break

    default:
      throw new Error(`Unknown task action: ${task.action}`)
  }

  await db
    .update(tables.serverSchedules)
    .set({
      lastRunAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tables.serverSchedules.id, scheduleId))
    .run()
}

export async function processDueSchedules(): Promise<void> {
  const db = useDrizzle()
  const now = new Date()

  const schedules = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.enabled, true))
    .all()

  for (const schedule of schedules) {

    if (_isScheduleDue(schedule, now)) {

      const tasks = await db
        .select()
        .from(tables.serverScheduleTasks)
        .where(eq(tables.serverScheduleTasks.scheduleId, schedule.id))
        .all()

      for (const task of tasks.sort((a, b) => a.sequenceId - b.sequenceId)) {
        try {

          if (task.timeOffset > 0) {
            await new Promise(resolve => setTimeout(resolve, task.timeOffset * 1000))
          }

          await executeScheduledTask(schedule.id, task.id)
        } catch (error) {
          console.error(`Failed to execute task ${task.id}:`, error)
        }
      }
    }
  }
}

function _isScheduleDue(schedule: Record<string, unknown>, now: Date): boolean {

  const cronExpression = schedule.cron as string | undefined
  const cronParts = cronExpression?.split(' ') || []
  if (cronParts.length !== 5) return false

  const [minute, hour, day, month, dayOfWeek] = cronParts

  if (!minute || !hour || !day || !month || !dayOfWeek) return false

  const validMinute = minute as string
  const validHour = hour as string
  const validDay = day as string
  const validMonth = month as string
  const validDayOfWeek = dayOfWeek as string

  const nowMinute = now.getMinutes()
  const nowHour = now.getHours()
  const nowDay = now.getDate()
  const nowMonth = now.getMonth() + 1
  const nowDayOfWeek = now.getDay()

  if (validMinute !== '*' && parseInt(validMinute) !== nowMinute) return false
  if (validHour !== '*' && parseInt(validHour) !== nowHour) return false
  if (validDay !== '*' && parseInt(validDay) !== nowDay) return false
  if (validMonth !== '*' && parseInt(validMonth) !== nowMonth) return false
  if (validDayOfWeek !== '*' && parseInt(validDayOfWeek) !== nowDayOfWeek) return false

  if (schedule.lastRunAt) {
    const lastRun = new Date(schedule.lastRunAt as string | number | Date)
    const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / 1000 / 60
    if (minutesSinceLastRun < 1) return false
  }

  return true
}

export function startTaskScheduler(): NodeJS.Timeout {

  return setInterval(() => {
    processDueSchedules().catch(error => {
      console.error('Task scheduler error:', error)
    })
  }, 60000)
}
