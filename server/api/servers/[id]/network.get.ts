import { listServerAllocations } from '#server/utils/serversStore';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Missing server identifier' });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const allocations = await listServerAllocations(server.id);

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.network.viewed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationCount: allocations.length,
    },
  });

  return {
    data: {
      primary: allocations.find((allocation) => allocation.isPrimary) ?? null,
      allocations: allocations.filter((allocation) => !allocation.isPrimary),
    },
  };
});
