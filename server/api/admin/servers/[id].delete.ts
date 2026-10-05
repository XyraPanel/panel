import { z } from 'zod';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Delete a server',
    description:
      'Deletes the server from Wings (unless force=true) and removes its DB record along with related allocations, limits, startup env, schedules, databases, subusers, backups, and mount links. Requires an admin session with the servers:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      {
        name: 'force',
        in: 'query',
        schema: { type: 'string' },
        description: 'Set to "true" to delete the panel record even if the Wings node is unreachable',
      },
    ],
    responses: {
      '200': {
        description: 'Server deleted',
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
      '409': { description: 'Failed to delete from Wings node (use force=true to override)' },
      '500': { description: 'Failed to delete server' },
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

  const query = await getValidatedQuery(
    event,
    z.object({
      force: z.string().optional(),
    }),
  );
  const force = query.force === 'true' || query.force === '1';

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

    if (server.nodeId && !force) {
      try {
        const { client } = await getWingsClientForServer(server.uuid);
        await client.deleteServer(server.uuid);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNotFound = errorMessage.includes('404') || errorMessage.includes('does not exist');

        if (!isNotFound) {
          debugError(`[Admin Server Delete] Failed to remove ${server.uuid} from Wings node:`, error);
          throw createError({
            status: 409,
            message:
              'Failed to delete server from Wings node. The node may be offline or unreachable. Use force=true to delete from panel anyway.',
          });
        }
      }
    }

    await db
      .update(tables.servers)
      .set({ allocationId: null })
      .where(eq(tables.servers.id, serverId));

    await db.delete(tables.serverLimits).where(eq(tables.serverLimits.serverId, serverId));

    await db
      .update(tables.serverAllocations)
      .set({ serverId: null, isPrimary: false })
      .where(eq(tables.serverAllocations.serverId, serverId));

    await db.delete(tables.serverStartupEnv).where(eq(tables.serverStartupEnv.serverId, serverId));

    await db.delete(tables.serverSchedules).where(eq(tables.serverSchedules.serverId, serverId));

    await db.delete(tables.serverDatabases).where(eq(tables.serverDatabases.serverId, serverId));

    await db.delete(tables.serverSubusers).where(eq(tables.serverSubusers.serverId, serverId));

    await db.delete(tables.serverBackups).where(eq(tables.serverBackups.serverId, serverId));

    await db.delete(tables.mountServer).where(eq(tables.mountServer.serverId, serverId));

    await db.delete(tables.servers).where(eq(tables.servers.id, serverId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.deleted',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
        forced: force,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server deleted successfully',
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Server Delete] Fatal failure for server:', serverId, error);
    throw createError({
      status: 500,
      message: 'Failed to delete server',
    });
  }
});
