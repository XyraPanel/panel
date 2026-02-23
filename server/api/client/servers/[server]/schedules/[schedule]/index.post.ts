import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { clientUpdateScheduleSchema } from '#shared/schema/server/operations';

function parseCronField(field: string): number | null {
  if (!field || field === '*' || field.startsWith('*/')) return null;
  const val = parseInt(field);
  return isNaN(val) ? null : val;
}

function calculateNextRun(cronExpression: string): Date {
  const now = new Date();
  const parts = cronExpression.trim().split(/\s+/);
  const [minuteField = '*', hourField = '*', dayField = '*', monthField = '*', weekdayField = '*'] =
    parts;

  const targetMinute = parseCronField(minuteField);
  const targetHour = parseCronField(hourField);
  const targetDay = parseCronField(dayField);
  const targetMonth = parseCronField(monthField);
  const targetWeekday = parseCronField(weekdayField);

  const nextRun = new Date(now);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);
  nextRun.setMinutes(nextRun.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 366; i++) {
    const ok =
      (targetMinute === null || nextRun.getMinutes() === targetMinute) &&
      (targetHour === null || nextRun.getHours() === targetHour) &&
      (targetDay === null || nextRun.getDate() === targetDay) &&
      (targetMonth === null || nextRun.getMonth() === targetMonth - 1) &&
      (targetWeekday === null || nextRun.getDay() === targetWeekday);

    if (ok) return nextRun;
    nextRun.setMinutes(nextRun.getMinutes() + 1);
  }

  const fallback = new Date(now);
  fallback.setMinutes(fallback.getMinutes() + 1);
  fallback.setSeconds(0);
  fallback.setMilliseconds(0);
  return fallback;
}

type ServerScheduleUpdate = typeof tables.serverSchedules.$inferInsert;

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const scheduleId = getRouterParam(event, 'schedule');

  if (!serverId || !scheduleId) {
    throw createError({
      status: 400,
      message: 'Server and schedule identifiers are required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.update'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    clientUpdateScheduleSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const [schedule] = await db
    .select()
    .from(tables.serverSchedules)
    .where(
      and(
        eq(tables.serverSchedules.id, scheduleId),
        eq(tables.serverSchedules.serverId, server.id),
      ),
    )
    .limit(1);

  if (!schedule) {
    throw createError({
      status: 404,
      message: 'Schedule not found',
    });
  }

  const updates: Partial<ServerScheduleUpdate> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name) {
    updates.name = body.name;
  }

  if (body.cron) {
    const cronString = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`;
    updates.cron = cronString;
    updates.nextRunAt = calculateNextRun(cronString);
  }

  if (body.is_active !== undefined) {
    updates.enabled = body.is_active;
  }

  await db
    .update(tables.serverSchedules)
    .set(updates)
    .where(eq(tables.serverSchedules.id, scheduleId));

  const [updated] = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .limit(1);

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.id,
    actorType: 'user',
    action: 'server.schedule.update',
    targetType: 'server',
    targetId: server.id,
    metadata: { scheduleId, updates: Object.keys(updates) },
  });

  const tasks = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
    .orderBy(tables.serverScheduleTasks.sequenceId);

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
      tasks: tasks.map((task) => ({
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
  };
});
