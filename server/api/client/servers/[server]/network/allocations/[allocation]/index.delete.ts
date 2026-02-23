import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  const allocationId = getRouterParam(event, 'allocation');

  if (!serverIdentifier || !allocationId) {
    throw createError({
      status: 400,
      message: 'Server and allocation identifiers are required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.delete'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();
  const [allocation] = await db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.id, allocationId),
        eq(tables.serverAllocations.serverId, server.id),
      ),
    )
    .limit(1);

  if (!allocation) {
    throw createError({
      status: 404,
      message: 'Allocation not found',
    });
  }

  if (allocation.id === server.allocationId) {
    throw createError({
      status: 400,
      message: 'Cannot delete primary allocation',
    });
  }

  await db
    .update(tables.serverAllocations)
    .set({
      serverId: null,
    })
    .where(eq(tables.serverAllocations.id, allocationId));

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.allocation.deleted',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationId,
      ip: allocation?.ip,
      port: allocation?.port,
    },
  });

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier });

  return {
    data: {
      success: true,
      message: 'Allocation removed from server',
    },
  };
});
