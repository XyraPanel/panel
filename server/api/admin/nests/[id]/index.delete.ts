import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NESTS, ADMIN_ACL_PERMISSIONS.WRITE);

  const nestId = getRouterParam(event, 'id');
  if (!nestId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Nest ID is required' });
  }

  const db = useDrizzle();

  const [existing] = await db
    .select()
    .from(tables.nests)
    .where(eq(tables.nests.id, nestId))
    .limit(1);

  if (!existing) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Nest not found' });
  }

  const eggsCount = await db
    .select({ id: tables.eggs.id })
    .from(tables.eggs)
    .where(eq(tables.eggs.nestId, nestId));

  if (eggsCount.length > 0) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: `Cannot delete nest with ${eggsCount.length} egg(s). Delete eggs first.`,
    });
  }

  await db.delete(tables.nests).where(eq(tables.nests.id, nestId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.nest.deleted',
    targetType: 'settings',
    targetId: nestId,
    metadata: {
      name: existing.name,
      author: existing.author,
    },
  });

  return {
    data: {
      success: true,
      deletedId: nestId,
    },
  };
});
