import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { getServerWithAccess } from '#server/utils/server-helpers';
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

  if (!schedule.action) {
    throw createError({
      status: 400,
      message: 'Schedule action is not defined',
    });
  }

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.schedule.executed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      scheduleId,
      scheduleName: schedule.name,
      executeType: 'manual',
    },
  });

  try {
    const { executeScheduledTask } = await import('#server/utils/task-scheduler');

    const tasks = await db
      .select()
      .from(tables.serverScheduleTasks)
      .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId));

    for (const task of tasks.sort((a, b) => a.sequenceId - b.sequenceId)) {
      if (task.timeOffset > 0) {
        await new Promise((resolve) => setTimeout(resolve, task.timeOffset * 1000));
      }

      await executeScheduledTask(scheduleId, task.id);
    }
  } catch (error) {
    console.error('Failed to execute schedule:', error);
    throw createError({
      status: 500,
      message: 'Failed to execute schedule tasks',
    });
  }

  await db
    .update(tables.serverSchedules)
    .set({
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.serverSchedules.id, scheduleId));

  return {
    data: {
      success: true,
      message: 'Schedule execution triggered',
    },
  };
});
