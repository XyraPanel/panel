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
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const hostId = getRouterParam(event, 'id');
  if (!hostId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Host ID is required' });
  }

  const db = useDrizzle();

  const [existing] = await db
    .select()
    .from(tables.databaseHosts)
    .where(eq(tables.databaseHosts.id, hostId))
    .limit(1);

  if (!existing) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Database host not found' });
  }

  const databasesCount = await db
    .select({ id: tables.serverDatabases.id })
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.databaseHostId, hostId));

  if (databasesCount.length > 0) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: `Cannot delete host with ${databasesCount.length} database(s)`,
    });
  }

  await db.delete(tables.databaseHosts).where(eq(tables.databaseHosts.id, hostId));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.database_host.deleted',
    targetType: 'settings',
    targetId: hostId,
    metadata: {
      hostName: existing.name,
      hostname: existing.hostname,
    },
  });

  return {
    data: {
      success: true,
      deletedId: hostId,
    },
  };
});
