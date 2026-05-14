import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  try {
    const session = await requireAdmin(event);

    await requireAdminApiKeyPermission(
      event,
      ADMIN_ACL_RESOURCES.LOCATIONS,
      ADMIN_ACL_PERMISSIONS.WRITE,
    );

    const { id: locationId } = getRouterParams(event);
    if (!locationId) {
      throw createError({
        status: 400,
        message: 'Location ID is required',
      });
    }

    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.locations)
      .where(eq(tables.locations.id, locationId))
      .limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Location not found' });
    }

    const nodesCount = await db
      .select({ id: tables.wingsNodes.id })
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.locationId, locationId));

    if (nodesCount.length > 0) {
      throw createError({
        status: 400,
        message: `Cannot delete location with ${nodesCount.length} assigned node(s)`,
      });
    }

    await db.delete(tables.locations).where(eq(tables.locations.id, locationId));

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.location.deleted',
      targetType: 'settings',
      targetId: locationId,
      metadata: {
        short: existing.short,
        long: existing.long,
      },
    });

    return {
      data: {
        success: true,
        deletedId: locationId,
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
