import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { listServerScheduleTasks } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Schedules'],
    summary: 'Get a schedule',
    description: 'Returns a single schedule with its tasks. Requires the server.schedule.read permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'schedule', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Schedule details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    cron: { type: 'string' },
                    is_active: { type: 'boolean' },
                    is_processing: { type: 'boolean' },
                    only_when_online: { type: 'boolean' },
                    last_run_at: { type: 'string', format: 'date-time', nullable: true },
                    next_run_at: { type: 'string', format: 'date-time', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                    tasks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          sequence_id: { type: 'integer' },
                          action: { type: 'string' },
                          payload: { type: 'string', nullable: true },
                          time_offset: { type: 'integer' },
                          is_queued: { type: 'boolean' },
                          continue_on_failure: { type: 'boolean' },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server or schedule identifier missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.schedule.read permission' },
      '404': { description: 'Server or schedule not found' },
    },
  },
});

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
