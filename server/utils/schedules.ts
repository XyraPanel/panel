import { eq } from 'drizzle-orm';
import type { Permission, ServerSchedule } from '#shared/types/server';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { withCache } from './cache';
import { buildScheduleListCacheKey } from './cache-keys';

const SERVER_SCHEDULE_LIST_CACHE_TTL = 60;

/**
 * Task actions execute privileged operations (console commands, power control,
 * backups) directly against Wings, bypassing the dedicated endpoints those
 * operations normally go through. Without this mapping, a subuser holding only
 * `server.schedule.update` could create/run a 'command' task and get arbitrary
 * console access despite never being granted `server.command`.
 */
const SCHEDULE_TASK_ACTION_PERMISSIONS: Record<string, Permission> = {
  command: 'server.command',
  power: 'server.power',
  backup: 'server.backup.create',
};

export function permissionForScheduleTaskAction(action: string): Permission | undefined {
  return SCHEDULE_TASK_ACTION_PERMISSIONS[action];
}

export async function listServerSchedules(serverId: string): Promise<ServerSchedule[]> {
  const cacheKey = buildScheduleListCacheKey(serverId);

  return withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();
      const schedules = await db
        .select()
        .from(tables.serverSchedules)
        .where(eq(tables.serverSchedules.serverId, serverId))
        .orderBy(tables.serverSchedules.name)
        // Defensive backstop — schedule creation has no per-server cap (unlike
        // backups, which are bounded by serverLimits.backupLimit), so nothing else
        // prevents unbounded growth here.
        .limit(200);

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
      }));
    },
    { ttl: SERVER_SCHEDULE_LIST_CACHE_TTL },
  );
}
