import { listServerSubusers } from '#server/utils/subusers';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';

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
    requiredPermissions: ['server.users.read'],
  });

  const subusers = await listServerSubusers(server.id);

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'server.users.listed',
    targetType: 'server',
    targetId: server.id,
    metadata: { count: subusers.length },
  });

  return {
    data: subusers,
  };
});
