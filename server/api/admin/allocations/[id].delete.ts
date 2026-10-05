import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Allocations'],
    summary: 'Delete an allocation',
    description:
      'Deletes an unassigned network allocation. Fails if the allocation is currently assigned to a server. Requires an admin session with the allocations:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Allocation ID' },
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
      '400': { description: 'Missing allocation ID, or allocation is assigned to a server' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing allocations:write ACL permission' },
      '404': { description: 'Allocation not found' },
      '500': { description: 'Failed to delete allocation' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.ALLOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const allocationId = getRouterParam(event, 'id');
  if (!allocationId) {
    throw createError({
      status: 400,
      message: 'Allocation ID is required',
    });
  }

  try {
    const db = useDrizzle();
    const allocationRows = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, allocationId))
      .limit(1);

    const allocation = allocationRows[0];

    if (!allocation) {
      throw createError({
        status: 404,
        message: 'Allocation not found',
      });
    }

    if (allocation.serverId) {
      throw createError({
        status: 400,
        message: 'Cannot delete allocation that is assigned to a server',
      });
    }

    await db.delete(tables.serverAllocations).where(eq(tables.serverAllocations.id, allocationId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.allocation.deleted',
      targetType: 'settings',
      targetId: allocationId,
      metadata: {
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
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Allocation Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete allocation',
    });
  }
});
