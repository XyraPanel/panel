import { getServerWithAccess } from '#server/utils/server-helpers';
import { logger } from '#server/utils/logger';
import {
  getWingsClientForServer,
  WingsAuthError,
  WingsConnectionError,
} from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get live server resource usage',
    description:
      'Fetches current CPU/memory/disk/network utilization and state directly from the Wings daemon. Requires the server.view permission (or server owner/admin). Returns a 200 with current_state "unknown" instead of erroring if Wings is unreachable.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Resource usage snapshot',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    current_state: { type: 'string' },
                    is_suspended: { type: 'boolean' },
                    error: { type: 'string' },
                    resources: {
                      type: 'object',
                      properties: {
                        memory_bytes: { type: 'integer' },
                        memory_limit_bytes: { type: 'integer' },
                        cpu_absolute: { type: 'number' },
                        disk_bytes: { type: 'integer' },
                        network_rx_bytes: { type: 'integer' },
                        network_tx_bytes: { type: 'integer' },
                        uptime: { type: 'integer' },
                        state: { type: 'string' },
                      },
                    },
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
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({ status: 400, message: 'Server identifier required' });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
    allowOwner: true,
    allowAdmin: true,
  });

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    const details = await client.getServerResources(server.uuid);

    return {
      data: {
        current_state: details.state || 'offline',
        is_suspended: details.is_suspended,
        resources: {
          memory_bytes: details.utilization.memory_bytes,
          memory_limit_bytes: details.utilization.memory_limit_bytes,
          cpu_absolute: details.utilization.cpu_absolute,
          disk_bytes: details.utilization.disk_bytes,
          network_rx_bytes: details.utilization.network.rx_bytes,
          network_tx_bytes: details.utilization.network.tx_bytes,
          uptime: details.utilization.uptime,
          state: details.state,
        },
      },
    };
  } catch (error) {
    logger.error('Wings resource fetch failed:', error);

    // Distinguish "we couldn't reach Wings" from "Wings told us the server is
    // stopped" — collapsing both into current_state: 'offline' made an unreachable
    // daemon indistinguishable from a genuinely stopped server.
    let errorMessage = 'Unknown error';
    if (error instanceof WingsAuthError) {
      errorMessage = 'Wings authentication failed';
    } else if (error instanceof WingsConnectionError) {
      errorMessage = 'Wings daemon unavailable';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      data: {
        current_state: 'unknown',
        is_suspended: false,
        error: errorMessage,
        resources: {
          memory_bytes: 0,
          memory_limit_bytes: 0,
          cpu_absolute: 0,
          disk_bytes: 0,
          network_rx_bytes: 0,
          network_tx_bytes: 0,
          uptime: 0,
          state: 'unknown',
        },
      },
    };
  }
});
