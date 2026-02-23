import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  const scheduleId = getRouterParam(event, 'schedule');
  const taskId = getRouterParam(event, 'task');

  if (!serverIdentifier || !scheduleId || !taskId) {
    throw createError({
      status: 400,
      message: 'Server, schedule, and task identifiers are required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

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

  const [task] = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(
      and(
        eq(tables.serverScheduleTasks.id, taskId),
        eq(tables.serverScheduleTasks.scheduleId, scheduleId),
      ),
    )
    .limit(1);

  if (!task) {
    throw createError({
      status: 404,
      message: 'Task not found',
    });
  }

  await db.delete(tables.serverScheduleTasks).where(eq(tables.serverScheduleTasks.id, taskId));

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.schedule.task.delete',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      scheduleId,
      taskId,
      action: task.action,
    },
  });

  return {
    data: {
      success: true,
    },
  };
});
