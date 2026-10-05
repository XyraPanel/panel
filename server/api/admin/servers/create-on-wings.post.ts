import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { provisionServerOnWings } from '#server/utils/server-provisioning';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { serverProvisionSchema } from '#shared/schema/admin/server';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Servers'],
    summary: 'Provision an existing server record on Wings',
    description:
      'Sends a create-server request to the assigned node\'s Wings daemon for a server that already has a DB record, node, egg, and primary allocation. Requires an admin session with the servers:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['serverId'],
            properties: {
              serverId: { type: 'string' },
              startOnCompletion: { type: 'boolean', default: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Server provisioned',
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
      '400': { description: 'Server missing node/egg configuration, or no primary allocation' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing servers:write ACL permission' },
      '404': { description: 'Server not found' },
      '500': { description: 'Failed to provision server on Wings' },
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

  const { serverId, startOnCompletion = true } = await readValidatedBodyWithLimit(
    event,
    serverProvisionSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  const [server] = serverRows;

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (!server.nodeId || !server.eggId) {
    throw createError({
      status: 400,
      message: 'Server is missing required configuration (node or egg)',
    });
  }

  const allocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id));

  const primaryAllocation = allocations.find((a) => a.isPrimary);
  if (!primaryAllocation) {
    throw createError({
      status: 400,
      message: 'Server has no primary allocation assigned',
    });
  }

  try {
    await provisionServerOnWings({
      serverId: server.id,
      serverUuid: server.uuid,
      eggId: server.eggId,
      nodeId: server.nodeId,
      allocationId: primaryAllocation.id,
      environment: {},
      startOnCompletion,
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.server.provisioned',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverUuid: server.uuid,
        startOnCompletion,
      },
    });

    return {
      data: {
        success: true,
        message: 'Server provisioned on Wings successfully',
      },
    };
  } catch (error) {
    logger.error('Failed to provision server on Wings:', error);
    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to provision server on Wings',
    });
  }
});
