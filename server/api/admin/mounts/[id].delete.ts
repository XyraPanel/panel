import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.MOUNTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const mountId = getRouterParam(event, 'id');
  if (!mountId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Mount ID is required' });
  }

  const db = useDrizzle();

  const [existing] = await db
    .select()
    .from(tables.mounts)
    .where(eq(tables.mounts.id, mountId))
    .limit(1);

  if (!existing) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Mount not found' });
  }

  await db.delete(tables.mounts).where(eq(tables.mounts.id, mountId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.mount.deleted',
    targetType: 'settings',
    targetId: mountId,
    metadata: {
      mountName: existing.name,
      source: existing.source,
      target: existing.target,
    },
  });

  return {
    data: {
      success: true,
      deletedId: mountId,
    },
  };
});
