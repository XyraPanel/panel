import { eq } from 'drizzle-orm'
import type { ServerSchedule } from '#shared/types/server-schedules'
import { useDrizzle } from './drizzle'
import * as tables from '~~/server/database/schema'

export async function listServerSchedules(serverId: string): Promise<ServerSchedule[]> {
  const db = useDrizzle()
  const schedules = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.serverId, serverId))
    .orderBy(tables.serverSchedules.name)

  return schedules.map((row) => ({
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    cron: row.cron,
    action: row.action,
    nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
    enabled: row.enabled,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }))
}
