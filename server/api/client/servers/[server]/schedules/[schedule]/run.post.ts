import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { TaskScheduler } from '#server/utils/task-scheduler';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');
  const scheduleId = getRouterParam(event, 'schedule');

  if (!serverId || !scheduleId) {
    throw createError({
      status: 400,
      message: 'Server and schedule identifiers are required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.schedule.update'],
    allowOwner: true,
    allowAdmin: true,
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

  try {
    const scheduler = new TaskScheduler();

    const tasks = await db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId))
      .orderBy(tables.serverScheduleTasks.sequenceId);

    if (tasks.length === 0) {
      throw createError({
        status: 400,
        message: 'Schedule has no tasks',
      });
    }

    const result = await scheduler.executeSchedule(scheduleId, true);

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.schedule.executed',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        scheduleId,
        success: result.success,
        taskCount: result.tasks.length,
      },
    });

    return {
      data: {
        success: result.success,
        executedAt: result.executedAt,
        tasks: result.tasks.length,
        taskResults: result.tasks,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute schedule';
    throw createError({
      status: 500,
      message,
    });
  }
});
