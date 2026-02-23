import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerAllocations } from '#server/utils/serversStore';
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
    requiredPermissions: ['allocation.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const allocations = await listServerAllocations(server.id);

  return {
    data: allocations.map((alloc) => ({
      id: alloc.id,
      ip: alloc.ip,
      port: alloc.port,
      ipAlias: alloc.ipAlias ?? null,
      notes: alloc.notes ?? null,
      isPrimary: Boolean(alloc.id === server.allocationId),
    })),
  };
});
