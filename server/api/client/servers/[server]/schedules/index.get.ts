import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerSchedules } from '#server/utils/schedules';
import { listServerScheduleTasks } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Schedules'],
    summary: 'List schedules',
    description:
      'Returns all schedules for the server, each with its task list. Requires the server.schedule.read permission.',
    parameters: [{ name: 'server', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Schedules for the server',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
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
      },
      '400': { description: 'Server identifier missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.schedule.read permission' },
      '404': { description: 'Server not found' },
    },
  },
});

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
