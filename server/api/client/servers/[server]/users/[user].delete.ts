import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerSubusersCache } from '#server/utils/subusers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');
  const subuserId = getRouterParam(event, 'user');

  if (!serverId || !subuserId) {
    throw createError({
      status: 400,
      message: 'Server and user identifiers are required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.delete'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();
  const [subuser] = await db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(eq(tables.serverSubusers.id, subuserId), eq(tables.serverSubusers.serverId, server.id)),
    )
    .limit(1);

  if (!subuser) {
    throw createError({
      status: 404,
      message: 'Subuser not found',
    });
  }

  await db.delete(tables.serverSubusers).where(eq(tables.serverSubusers.id, subuserId));

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.users.deleted',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      subuserId,
      targetUserId: subuser.userId,
    },
  });

  await invalidateServerSubusersCache(server.id, [subuser.userId]);

  return {
    data: {
      success: true,
    },
  };
});
