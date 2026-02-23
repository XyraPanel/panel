import { randomUUID } from 'node:crypto';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { createSubuserSchema } from '#shared/schema/server/subusers';
import { invalidateServerSubusersCache } from '#server/utils/subusers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverId, accountContext.session);

  // Verify user has permission to manage server users
  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(event, createSubuserSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();
  const [targetUser] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email))
    .limit(1);

  if (!targetUser) {
    throw createError({
      status: 404,
      message: 'User not found with that email address',
    });
  }

  const [existing] = await db
    .select()
    .from(tables.serverSubusers)
    .where(
      and(
        eq(tables.serverSubusers.serverId, server.id),
        eq(tables.serverSubusers.userId, targetUser.id),
      ),
    )
    .limit(1);

  if (existing) {
    throw createError({
      status: 400,
      message: 'User is already a subuser on this server',
    });
  }

  const subuserId = randomUUID();
  const now = new Date();

  await db.insert(tables.serverSubusers).values({
    id: subuserId,
    serverId: server.id,
    userId: targetUser.id,
    permissions: JSON.stringify(body.permissions),
    createdAt: now,
    updatedAt: now,
  });

  const [subuser] = await db
    .select()
    .from(tables.serverSubusers)
    .where(eq(tables.serverSubusers.id, subuserId))
    .limit(1);

  await invalidateServerSubusersCache(server.id, [targetUser.id]);

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.users.added',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      subuserId,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      permissions: body.permissions,
    },
  });

  return {
    data: {
      id: subuser!.id,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        image: targetUser.image,
      },
      permissions: JSON.parse(subuser!.permissions),
      created_at: subuser!.createdAt,
      updated_at: subuser!.updatedAt,
    },
  };
});
