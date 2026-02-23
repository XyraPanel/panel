import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, isNull, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['allocation.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();
  const existingAllocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id));

  if (server.allocationLimit && existingAllocations.length >= server.allocationLimit) {
    throw createError({
      status: 403,
      message: 'Allocation limit reached',
    });
  }

  const availableAllocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.nodeId, server.nodeId!),
        isNull(tables.serverAllocations.serverId),
      ),
    );

  if (availableAllocations.length === 0) {
    throw createError({
      status: 404,
      message: 'No available allocations on this node',
    });
  }

  const allocation = availableAllocations[0];

  if (!allocation) {
    throw createError({
      status: 404,
      message: 'No allocation found',
    });
  }

  const now = new Date();
  const allocationId = allocation.id;

  await db
    .update(tables.serverAllocations)
    .set({
      serverId: server.id,
      updatedAt: now,
    })
    .where(eq(tables.serverAllocations.id, allocation.id));

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.allocation.created',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      allocationId,
      ip: allocation.ip,
      port: allocation.port,
    },
  });

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier });

  return {
    data: {
      id: allocation.id,
      ip: allocation.ip,
      port: allocation.port,
      ipAlias: allocation.ipAlias ?? null,
      notes: allocation.notes ?? null,
      isPrimary: Boolean(allocation.id === server.allocationId),
    },
  };
});
