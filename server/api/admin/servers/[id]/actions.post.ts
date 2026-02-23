import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { serverManager } from '#server/utils/server-manager';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { WingsConnectionError, WingsAuthError } from '#server/utils/wings-client';
import type { ServerActionResponse } from '#shared/types/admin';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { serverActionSchema } from '#shared/schema/admin/actions';

export default defineEventHandler(async (event): Promise<ServerActionResponse> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const serverId = getRouterParam(event, 'id');
  if (!serverId) {
    throw createError({ status: 400, statusText: 'Server ID is required' });
  }

  const body = await readValidatedBodyWithLimit(event, serverActionSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();
  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' });
  }

  try {
    const options = { userId: serverId };

    switch (body.action) {
      case 'suspend':
        await serverManager.suspendServer(server.uuid, options);
        break;
      case 'unsuspend':
        await serverManager.unsuspendServer(server.uuid, options);
        break;
      case 'reinstall':
        await serverManager.reinstallServer(server.uuid, options);
        break;
      case 'delete':
        await serverManager.deleteServer(server.uuid, options);
        break;
      case 'start':
      case 'stop':
      case 'restart':
      case 'kill':
        await serverManager.powerAction(server.uuid, body.action, options);
        break;
      default:
        throw createError({ status: 400, statusText: 'Invalid action' });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: `admin.server.action.${body.action}`,
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
        action: body.action,
      },
    });

    return {
      data: {
        success: true,
        message: `Server ${body.action} action completed successfully`,
      },
    };
  } catch (error) {
    console.error(`Server ${body.action} action failed:`, error);

    if (error instanceof WingsAuthError) {
      throw createError({
        status: 403,
        statusText: 'Wings authentication failed',
        data: { error: error.message },
      });
    }

    if (error instanceof WingsConnectionError) {
      throw createError({
        status: 503,
        statusText: 'Wings daemon unavailable',
        data: { error: error.message },
      });
    }

    throw createError({
      status: 500,
      statusText: `Failed to ${body.action} server`,
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
