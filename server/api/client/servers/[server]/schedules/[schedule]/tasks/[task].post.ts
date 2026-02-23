import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { updateTaskSchema } from '#shared/schema/server/operations';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

type ScheduleTaskUpdate = typeof tables.serverScheduleTasks.$inferInsert;

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

  const body = await readValidatedBodyWithLimit(event, updateTaskSchema, BODY_SIZE_LIMITS.MEDIUM);

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

  const updates: Partial<ScheduleTaskUpdate> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.action) updates.action = body.action;
  if (body.payload !== undefined) updates.payload = body.payload;
  if (body.time_offset !== undefined) updates.timeOffset = body.time_offset;
  if (body.continue_on_failure !== undefined) updates.continueOnFailure = body.continue_on_failure;

  await db
    .update(tables.serverScheduleTasks)
    .set(updates)
    .where(eq(tables.serverScheduleTasks.id, taskId));

  const [updated] = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .limit(1);

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.schedule.task.update',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      scheduleId,
      taskId,
      updates: Object.keys(updates),
    },
  });

  return {
    data: {
      id: updated!.id,
      sequenceId: updated!.sequenceId,
      action: updated!.action,
      payload: updated!.payload,
      timeOffset: updated!.timeOffset,
      isQueued: updated!.isQueued,
      continueOnFailure: updated!.continueOnFailure,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    },
  };
});
