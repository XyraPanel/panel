import { updateAllocationSchema } from '#shared/schema/admin/infrastructure';
import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Allocations'],
    summary: 'Update an allocation',
    description:
      'Updates the IP alias of a network allocation. Requires an admin session with the allocations:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Allocation ID' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ipAlias: { type: 'string', nullable: true, description: 'Optional friendly hostname/alias for the allocation IP' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Allocation updated',
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
                    allocation: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        ipAlias: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing allocation ID, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing allocations:write ACL permission' },
      '404': { description: 'Allocation not found' },
      '500': { description: 'Failed to update allocation' },
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

  const { ipAlias } = await readValidatedBodyWithLimit(
    event,
    updateAllocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  try {
    const db = useDrizzle();
    const [allocation] = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, allocationId))
      .limit(1);

    if (!allocation) {
      throw createError({
        status: 404,
        message: 'Allocation not found',
      });
    }

    const trimmedIpAlias = typeof ipAlias === 'string' && ipAlias.trim().length > 0 ? ipAlias.trim() : null;

    await db
      .update(tables.serverAllocations)
      .set({
        ipAlias: trimmedIpAlias,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverAllocations.id, allocationId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.allocation.updated',
      targetType: 'settings',
      targetId: allocationId,
      metadata: {
        ip: allocation.ip,
        port: allocation.port,
        ipAlias: ipAlias || null,
      },
    });

    return {
      data: {
        success: true,
        message: 'Allocation updated successfully',
        allocation: {
          id: allocationId,
          ipAlias: trimmedIpAlias,
        },
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Allocation Patch] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to update allocation',
    });
  }
});
