import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      status: 400,
      message: 'Server ID is required',
    });
  }

  const db = useDrizzle();

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, id))
    .limit(1);

  const [server] = serverRows;

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  const { getWingsClientForServer } = await import('#server/utils/wings-client');
  const { client } = await getWingsClientForServer(server.uuid);

  try {
    await client.syncServer(server.uuid);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.synced',
      targetType: 'server',
      targetId: id,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server sync triggered successfully',
      },
    };
  } catch (error) {
    console.error('Failed to sync server:', error);
    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to sync server',
    });
  }
});
