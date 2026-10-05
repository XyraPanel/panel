import { getServerStatus } from '#server/utils/server-status';
import { logger } from '#server/utils/logger';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get cached server status',
    description:
      'Returns the cached (near-real-time) power state, online/suspended flags, and utilization for a server. Requires the server.view permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Server status',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    state: { type: 'string' },
                    isOnline: { type: 'boolean' },
                    isSuspended: { type: 'boolean' },
                    utilization: { type: 'object' },
                    lastChecked: { type: 'string' },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.view permission' },
      '404': { description: 'Server not found or not accessible' },
      '500': { description: 'Failed to get server status' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);

  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({ status: 400, message: 'Server identifier required' });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
  });

  try {
    const status = await getServerStatus(server.uuid);

    return {
      data: {
        state: status.state,
        isOnline: status.isOnline,
        isSuspended: status.isSuspended,
        utilization: status.utilization,
        lastChecked: status.lastChecked,
        error: status.error,
      },
    };
  } catch (error) {
    logger.error('Failed to get server status:', error);
    throw createError({
      status: 500,
      message: 'Failed to get server status',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
