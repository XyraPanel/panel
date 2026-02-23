import { randomUUID } from 'crypto';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { createTaskSchema } from '#shared/schema/server/operations';
import { invalidateScheduleCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { requireAccountUser } from '#server/utils/security';

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

  const body = await readValidatedBodyWithLimit(event, createTaskSchema, BODY_SIZE_LIMITS.MEDIUM);

  const existingTasks = await db
    .select({ sequenceId: tables.serverScheduleTasks.sequenceId })
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId));

  const nextSequenceId =
    existingTasks.length > 0 ? Math.max(...existingTasks.map((t) => t.sequenceId)) + 1 : 1;

  const taskId = randomUUID();
  const now = new Date();

  await db.insert(tables.serverScheduleTasks).values({
    id: taskId,
    scheduleId,
    sequenceId: nextSequenceId,
    action: body.action,
    payload: body.payload,
    timeOffset: body.time_offset ?? 0,
    continueOnFailure: body.continue_on_failure ?? false,
    isQueued: false,
    createdAt: now,
    updatedAt: now,
  });

  const [task] = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.id, taskId))
    .limit(1);

  await invalidateScheduleCaches({ serverId: server.id, scheduleId });

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.schedule.task.created',
    server: { id: server.id, uuid: server.uuid },
    metadata: { scheduleId, taskId, action: body.action },
  });

  return {
    data: {
      id: task!.id,
      sequence_id: task!.sequenceId,
      action: task!.action,
      payload: task!.payload,
      time_offset: task!.timeOffset,
      is_queued: task!.isQueued,
      continue_on_failure: task!.continueOnFailure,
      created_at: task!.createdAt,
      updated_at: task!.updatedAt,
    },
  };
});
