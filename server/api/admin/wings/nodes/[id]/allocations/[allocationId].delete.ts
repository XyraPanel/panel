import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Wings Nodes'],
    summary: 'Delete a node allocation',
    description:
      'Deletes an IP/port allocation from a Wings node. Fails if the allocation is currently assigned to a server. Requires an admin session with the nodes:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Node ID' },
      { name: 'allocationId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Allocation deleted',
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
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing node/allocation ID, or allocation assigned to a server' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing nodes:write ACL permission' },
      '404': { description: 'Allocation not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
  const { id: nodeId, allocationId } = getRouterParams(event);

  if (!nodeId || typeof nodeId !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  if (!allocationId || typeof allocationId !== 'string') {
    throw createError({ status: 400, message: 'Missing allocation id' });
  }

  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.WRITE);

  const db = useDrizzle();

  const [allocation] = await db
    .select()
    .from(tables.serverAllocations)
    .where(
      and(
        eq(tables.serverAllocations.id, allocationId),
        eq(tables.serverAllocations.nodeId, nodeId),
      ),
    )
    .limit(1);

  if (!allocation) {
    throw createError({ status: 404, message: 'Allocation not found' });
  }

  if (allocation.serverId) {
    throw createError({
      status: 400,
      message: 'Cannot delete allocation assigned to a server',
    });
  }

  await db.delete(tables.serverAllocations).where(eq(tables.serverAllocations.id, allocationId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocation.deleted',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      allocationId,
      ip: allocation.ip,
      port: allocation.port,
    },
  });

  return {
    data: {
      success: true,
      message: 'Allocation deleted successfully',
    },
  };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});
