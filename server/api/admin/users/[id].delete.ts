import { count } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Users'],
    summary: 'Delete a user',
    description:
      'Destructive action: permanently deletes the target user account. Fails if the user owns any servers (they must be transferred or deleted first), or if the target is the calling admin. Requires an admin session with the users:write ACL permission.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID',
      },
    ],
    responses: {
      '200': {
        description: 'User deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    userId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'User ID is required, cannot delete self, or user owns servers' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing users:write ACL permission' },
      '404': { description: 'User not found' },
      '500': { description: 'Failed to delete user' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE);

  const userId = getRouterParam(event, 'id');
  if (!userId) {
    throw createError({ status: 400, message: 'User ID is required' });
  }

  if (userId === session.user.id) {
    throw createError({
      status: 400,
      message: 'Cannot delete your own account',
    });
  }

  try {
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
      throw createError({ status: 404, message: 'User not found' });
    }

    const serverCountResult = await db
      .select({ serversOwned: count() })
      .from(tables.servers)
      .where(eq(tables.servers.ownerId, userId));

    const serversOwned = serverCountResult[0]?.serversOwned ?? 0;

    if (serversOwned > 0) {
      throw createError({
        status: 400,
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
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('Fatal error during admin user deletion:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete user',
    });
  }
});
