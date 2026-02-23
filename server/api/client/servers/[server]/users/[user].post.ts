import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerSubusersCache } from '#server/utils/subusers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { serverSubuserPermissionsSchema } from '#shared/schema/server/operations';

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
    requiredPermissions: ['server.users.update'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(
    event,
    serverSubuserPermissionsSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

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

  const now = new Date();
  await db
    .update(tables.serverSubusers)
    .set({
      permissions: JSON.stringify(body.permissions),
      updatedAt: now,
    })
    .where(eq(tables.serverSubusers.id, subuserId));

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.users.updated',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      subuserId,
      permissions: body.permissions,
    },
  });

  const [result] = await db
    .select({
      subuser: tables.serverSubusers,
      user: tables.users,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(eq(tables.serverSubusers.id, subuserId))
    .limit(1);

  await invalidateServerSubusersCache(server.id, [subuser.userId]);

  return {
    data: {
      id: result!.subuser.id,
      user: {
        id: result!.user!.id,
        username: result!.user!.username,
        email: result!.user!.email,
        image: result!.user!.image,
      },
      permissions: JSON.parse(result!.subuser.permissions),
      created_at: result!.subuser.createdAt,
      updated_at: result!.subuser.updatedAt,
    },
  };
});
