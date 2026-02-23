import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { testDatabaseHostConnection } from '#server/utils/database-provisioner';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const hostId = getRouterParam(event, 'id');
  if (!hostId) {
    throw createError({ status: 400, message: 'Host ID is required' });
  }

  const db = useDrizzle();
  const [host] = await db
    .select()
    .from(tables.databaseHosts)
    .where(eq(tables.databaseHosts.id, hostId))
    .limit(1);

  if (!host) {
    throw createError({ status: 404, message: 'Database host not found' });
  }

  try {
    await testDatabaseHostConnection(host);
    return { data: { success: true, message: 'Connection successful' } };
  } catch (error) {
    throw createError({
      status: 502,
      message: error instanceof Error ? error.message : 'Connection failed',
    });
  }
});
