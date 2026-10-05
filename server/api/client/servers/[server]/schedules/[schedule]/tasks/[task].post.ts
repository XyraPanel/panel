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
import { permissionForScheduleTaskAction } from '#server/utils/schedules';

type ScheduleTaskUpdate = typeof tables.serverScheduleTasks.$inferInsert;

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Schedules'],
    summary: 'Update a schedule task',
    description:
      'Partially updates a task\'s action, payload, offset, or failure behavior. Requires the server.schedule.update permission, plus the permission for the (possibly new) action unless the caller is the owner or an admin.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'schedule', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'task', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              action: { type: 'string', minLength: 1, maxLength: 255 },
              payload: { type: 'string', minLength: 1, maxLength: 10000 },
              time_offset: { type: 'integer', minimum: 0, maximum: 3600 },
              continue_on_failure: { type: 'boolean' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Task updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    sequenceId: { type: 'integer' },
                    action: { type: 'string' },
                    payload: { type: 'string' },
                    timeOffset: { type: 'integer' },
                    isQueued: { type: 'boolean' },
                    continueOnFailure: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.schedule.update permission or the task-action permission' },
      '404': { description: 'Server, schedule, or task not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
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

  const effectiveAction = body.action ?? task.action;
  const requiredActionPermission = permissionForScheduleTaskAction(effectiveAction);
  if (requiredActionPermission) {
    await requireServerPermission(event, {
      serverId: server.id,
      requiredPermissions: [requiredActionPermission],
      allowOwner: true,
      allowAdmin: true,
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
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
