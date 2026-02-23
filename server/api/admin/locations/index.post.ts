import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { createLocationSchema } from '#shared/schema/admin/infrastructure';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.LOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(
    event,
    createLocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const now = new Date();

  const newLocation = {
    id: randomUUID(),
    short: body.short.trim(),
    long: body.long?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.locations).values(newLocation);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.location.created',
    targetType: 'settings',
    targetId: newLocation.id,
    metadata: {
      short: newLocation.short,
      long: newLocation.long,
    },
  });

  return {
    data: {
      id: newLocation.id,
      short: newLocation.short,
      long: newLocation.long,
      createdAt: newLocation.createdAt,
      updatedAt: newLocation.updatedAt,
    },
  };
});
