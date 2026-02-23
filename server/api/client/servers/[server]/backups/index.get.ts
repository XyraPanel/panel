import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerBackups } from '#server/utils/backups';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

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
    requiredPermissions: ['backup.read'],
  });

  const backups = await listServerBackups(server.id);

  return {
    data: backups,
  };
});
