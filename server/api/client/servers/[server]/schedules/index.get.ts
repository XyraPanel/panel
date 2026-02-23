import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerSchedules } from '#server/utils/schedules';
import { listServerScheduleTasks } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

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
    requiredPermissions: ['server.schedule.read'],
  });

  const schedules = await listServerSchedules(server.id);

  const schedulesWithTasks = await Promise.all(
    schedules.map(async (schedule) => {
      const tasks = await listServerScheduleTasks(schedule.id);

      return {
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
      };
    }),
  );

  return {
    data: schedulesWithTasks,
  };
});
