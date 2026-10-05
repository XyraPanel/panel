import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Unsuspend a server',
    description:
      'Clears the server\'s suspended flag and syncs the change to Wings, rolling back if the sync fails. Requires an admin session with the servers:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Server unsuspended (or was already unsuspended)',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: { success: { type: 'boolean' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:write ACL permission' },
      '404': { description: 'Server not found' },
      '500': { description: 'Failed to sync unsuspension status with node' },
    },
  },
});

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

  try {
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
      const [node] = await db
        .select({ id: tables.wingsNodes.id })
        .from(tables.wingsNodes)
        .where(eq(tables.wingsNodes.id, server.nodeId))
        .limit(1);

      if (node) {
        try {
          const { client } = await getWingsClientForServer(server.uuid);
          await client.syncServer(server.uuid);
        } catch (error) {
          debugError('[Admin Server Unsuspend] Failed to sync with Wings:', error);

          await db
            .update(tables.servers)
            .set({ suspended: true })
            .where(eq(tables.servers.id, serverId));

          throw createError({
            status: 500,
            message: 'Failed to sync unsuspension status with node',
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
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Server Unsuspend] Fatal failure for server:', serverId, error);
    throw createError({
      status: 500,
      message: 'Failed to unsuspend server',
    });
  }
});
