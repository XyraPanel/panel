import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordAuditEventFromRequest } from '#server/utils/audit';

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
  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  const server = serverRows[0];

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (!server.suspended) {
    return {
      data: {
        success: true,
        message: 'Server is already unsuspended',
      },
    };
  }

  await db.update(tables.servers).set({ suspended: false }).where(eq(tables.servers.id, serverId));

  if (server.nodeId) {
    const nodeRows = await db
      .select()
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, server.nodeId))
      .limit(1);

    const node = nodeRows[0];

    if (node) {
      try {
        const { client } = await getWingsClientForServer(server.uuid);

        await client.updateServer(server.uuid, { suspended: false });
      } catch (error) {
        console.error('Failed to sync unsuspension with Wings:', error);

        await db
          .update(tables.servers)
          .set({ suspended: true })
          .where(eq(tables.servers.id, serverId));

        throw createError({
          status: 500,
          message: 'Failed to sync suspension status with node',
        });
      }
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.unsuspended',
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
      message: 'Server unsuspended successfully',
    },
  };
});
