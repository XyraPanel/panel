import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
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
  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.users.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();
  const [result] = await db
    .select({
      subuser: tables.serverSubusers,
      user: tables.users,
    })
    .from(tables.serverSubusers)
    .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
    .where(
      and(eq(tables.serverSubusers.id, subuserId), eq(tables.serverSubusers.serverId, server.id)),
    )
    .limit(1);

  if (!result) {
    throw createError({
      status: 404,
      message: 'Subuser not found',
    });
  }

  const { subuser, user: targetUser } = result;

  return {
    data: {
      id: subuser.id,
      user: {
        id: targetUser!.id,
        username: targetUser!.username,
        email: targetUser!.email,
        image: targetUser!.image,
      },
      permissions: JSON.parse(subuser.permissions),
      created_at: subuser.createdAt,
      updated_at: subuser.updatedAt,
    },
  };
});
