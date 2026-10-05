import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { processSchedule } from '#server/tasks/scheduler/process';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';
import { permissionForScheduleTaskAction } from '#server/utils/schedules';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Schedules'],
    summary: 'Run a schedule now',
    description:
      'Immediately executes all tasks in the schedule. Requires the server.schedule.update permission, plus the permission for each distinct task action being run (e.g. power/command/backup) unless the caller is the owner or an admin.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'schedule', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Schedule executed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    executedAt: { type: 'string', format: 'date-time' },
                    tasks: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing identifiers, or schedule has no tasks' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.schedule.update permission or a required task-action permission' },
      '404': { description: 'Server or schedule not found' },
      '500': { description: 'Schedule execution failed' },
    },
  },
});

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

  const tasks = await db
    .select()
    .from(tables.serverScheduleTasks)
    .where(eq(tables.serverScheduleTasks.scheduleId, scheduleId));

  if (tasks.length === 0) {
    throw createError({
      status: 400,
      message: 'Schedule has no tasks',
    });
  }

  // A schedule's tasks may have been authored by someone with broader permissions
  // (e.g. the owner or an admin) than the actor manually triggering it now — don't
  // let `server.schedule.update` alone be a way to run console commands, power
  // actions, or backups without also holding the permission those actions require.
  const requiredActionPermissions = new Set(
    tasks
      .map((task) => permissionForScheduleTaskAction(task.action))
      .filter((permission): permission is NonNullable<typeof permission> => Boolean(permission)),
  );
  if (requiredActionPermissions.size > 0) {
    await requireServerPermission(event, {
      serverId: server.id,
      requiredPermissions: [...requiredActionPermissions],
      allowOwner: true,
      allowAdmin: true,
    });
  }

  try {
    await processSchedule(scheduleId, db);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute schedule';
    throw createError({
      status: 500,
      message,
    });
  }

  const [updated] = await db
    .select()
    .from(tables.serverSchedules)
    .where(eq(tables.serverSchedules.id, scheduleId))
    .limit(1);

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.schedule.executed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      scheduleId,
      scheduleName: schedule.name,
      taskCount: tasks.length,
    },
  });

  return {
    data: {
      success: true,
      executedAt: updated?.lastRunAt ?? new Date().toISOString(),
      tasks: tasks.length,
    },
  };
});
