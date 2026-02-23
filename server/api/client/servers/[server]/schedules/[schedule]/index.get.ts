import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { listServerScheduleTasks } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

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
    requiredPermissions: ['server.schedule.read'],
  });

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

  const tasks = await listServerScheduleTasks(schedule.id);

  return {
    data: {
      id: schedule.id,
      name: schedule.name,
      cron: schedule.cron,
      is_active: schedule.enabled,
      is_processing: false,
      only_when_online: false,
      last_run_at: schedule.lastRunAt,
      next_run_at: schedule.nextRunAt,
      created_at: schedule.createdAt,
      updated_at: schedule.updatedAt,
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
