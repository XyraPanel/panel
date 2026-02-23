import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { createScheduleSchema } from '#shared/schema/server/operations';

function parseCronField(field: string): number | null {
  if (!field || field === '*') return null;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return isNaN(step) ? null : null;
  }
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

  const maxAttempts = 60 * 24 * 366;
  for (let i = 0; i < maxAttempts; i++) {
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

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.create'],
  });

  const body = await readValidatedBodyWithLimit(
    event,
    createScheduleSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const cronString = `${body.cron.minute} ${body.cron.hour} ${body.cron.day_of_month} ${body.cron.month} ${body.cron.day_of_week}`;

  const db = useDrizzle();
  const scheduleId = randomUUID();
  const now = new Date();

  const nextRunAt = calculateNextRun(cronString);

  await db.insert(tables.serverSchedules).values({
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
  });

  const [schedule] = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .limit(1);

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.id,
    actorType: 'user',
    action: 'server.schedule.create',
    targetType: 'server',
    targetId: server.id,
    metadata: { scheduleId, name: body.name, cron: cronString },
  });

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
  };
});
