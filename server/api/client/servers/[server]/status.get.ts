import { getServerStatus } from '#server/utils/server-status';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);

  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({ status: 400, statusText: 'Server identifier required' });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
  });

  try {
    const status = await getServerStatus(serverIdentifier);

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
    console.error('Failed to get server status:', error);
    throw createError({
      status: 500,
      statusText: 'Failed to get server status',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
