import { requireAdmin } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { checkInstallationStatus } from '#server/utils/server-provisioning';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Check a server\'s installation status',
    description:
      'Polls Wings for the server\'s current install/container status and syncs the panel status if installation just completed. Requires an admin session with the servers:read ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Installation status',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    installing: { type: 'boolean' },
                    serverStatus: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:read ACL permission' },
      '404': { description: 'Server not found' },
      '500': { description: 'Failed to check installation status' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.READ,
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

  try {
    const status = await checkInstallationStatus(server.uuid);

    if (server.status === 'installing' && status.status !== 'installing') {
      await db
        .update(tables.servers)
        .set({
          status: status.status === 'running' ? 'online' : 'offline',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.servers.id, serverId));
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.installation_status.viewed',
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverUuid: server.uuid,
        status: status.status,
        installing: status.installing,
      },
    });

    return {
      data: {
        status: status.status,
        installing: status.installing,
        serverStatus: server.status,
      },
    };
  } catch (error) {
    logger.error('Failed to check installation status:', error);
    throw createError({
      status: 500,
      message: 'Failed to check installation status',
    });
  }
});
