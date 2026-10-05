import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Nodes'],
    summary: 'List a node\'s allocations',
    description:
      'Returns all port allocations belonging to the given node. Requires an admin session with the allocations:read ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'List of allocations',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      nodeId: { type: 'string' },
                      serverId: { type: 'string', nullable: true },
                      ip: { type: 'string' },
                      port: { type: 'integer' },
                      ipAlias: { type: 'string', nullable: true },
                      notes: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Node ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing allocations:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.ALLOCATIONS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const { id: nodeId } = getRouterParams(event);
  if (!nodeId) {
    throw createError({
      status: 400,
      message: 'Node ID is required',
    });
  }

  const db = useDrizzle();
  const allocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.nodeId, nodeId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.allocations.listed',
    targetType: 'node',
    targetId: nodeId,
    metadata: {
      count: allocations.length,
    },
  });

  return {
    data: allocations,
  };
});
