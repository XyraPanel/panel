import { getServerWithAccess } from '#server/utils/server-helpers';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({ status: 400, statusText: 'Server identifier required' });
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
    const { client } = await getWingsClientForServer(server.uuid as string);
    const details = await client.getServerResources(server.uuid as string);

    return {
      data: {
        current_state: details.state || 'offline',
        is_suspended: details.isSuspended,
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
    console.error('Wings resource fetch failed:', error);

    return {
      data: {
        current_state: 'offline',
        is_suspended: false,
        resources: {
          memory_bytes: 0,
          memory_limit_bytes: 0,
          cpu_absolute: 0,
          disk_bytes: 0,
          network_rx_bytes: 0,
          network_tx_bytes: 0,
          uptime: 0,
          state: 'offline',
        },
      },
    };
  }
});
