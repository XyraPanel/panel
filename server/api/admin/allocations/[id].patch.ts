import { updateAllocationSchema } from '#shared/schema/admin/infrastructure';
import { debugError } from '#server/utils/logger';

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
