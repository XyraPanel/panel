import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerSubusers } from '#server/utils/subusers';
import { requireAccountUser } from '#server/utils/security';
import { requireServerPermission } from '#server/utils/permission-middleware';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const subusers = await listServerSubusers(server.id);

  return {
    data: subusers,
  };
});
