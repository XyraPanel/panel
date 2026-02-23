import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getWingsClientForServer } from '#server/utils/wings-client';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const serverId = getRouterParam(event, 'id');
  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server ID is required',
    });
  }

  const db = useDrizzle();
  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (!server.nodeId) {
    throw createError({
      status: 400,
      message: 'Server has no node assigned',
    });
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.reinstallServer(server.uuid);

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.reinstalled',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server reinstall initiated',
      },
    };
  } catch (error) {
    const err = error as Error;
    throw createError({
      status: 500,
      statusText: `Failed to trigger server reinstall: ${err.message}`,
    });
  }
});
