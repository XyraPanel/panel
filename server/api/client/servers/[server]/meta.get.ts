import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
  });

  return {
    data: {
      id: server.id,
      identifier: server.identifier,
      name: server.name,
    },
  };
});
