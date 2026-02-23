import { count } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' });
  }

  if (userId === session.user.id) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Cannot delete your own account',
    });
  }

  const db = useDrizzle();

  const userResult = await db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'User not found' });
  }

  const serverCountResult = await db
    .select({ serversOwned: count() })
    .from(tables.servers)
    .where(eq(tables.servers.ownerId, userId));

  const serversOwned = serverCountResult[0]?.serversOwned ?? 0;

  if (serversOwned > 0) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: `Cannot delete user: owns ${serversOwned} server(s). Transfer or delete servers first.`,
    });
  }

  await db.delete(tables.users).where(eq(tables.users.id, userId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.user.deleted',
    targetType: 'user',
    targetId: userId,
  });

  return {
    data: {
      success: true,
      message: 'User deleted successfully',
      userId,
    },
  };
});
