import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { updateLocationSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.LOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const locationId = getRouterParam(event, 'id');
  if (!locationId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Location ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateLocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const db = useDrizzle();

  const existing = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .limit(1);

  const existingRow = existing[0];

  if (!existingRow) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Location not found' });
  }

  const updates: Partial<typeof tables.locations.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.short !== undefined) updates.short = body.short.trim();
  if (body.long !== undefined) updates.long = body.long?.trim() ?? null;

  await db.update(tables.locations).set(updates).where(eq(tables.locations.id, locationId));

  const updatedRows = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .limit(1);

  const updated = updatedRows[0];

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.location.updated',
    targetType: 'settings',
    targetId: locationId,
    metadata: {
      fields: Object.keys(body),
    },
  });

  return {
    data: {
      id: updated!.id,
      short: updated!.short,
      long: updated!.long,
      createdAt: new Date(updated!.createdAt).toISOString(),
      updatedAt: new Date(updated!.updatedAt).toISOString(),
    },
  };
});
