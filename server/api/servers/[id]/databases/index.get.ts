import { listServerDatabases } from '#server/utils/databases';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const databases = await listServerDatabases(server.id);

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.database.listed',
    server: { id: server.id, uuid: server.uuid },
    metadata: { count: databases.length },
  });

  return {
    data: databases,
  };
});
