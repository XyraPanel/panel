import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { testDatabaseHostConnection } from '#server/utils/database-provisioner';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Database Hosts'],
    summary: 'Test a database host connection',
    description:
      'Attempts to connect to the given database host using its stored credentials to verify connectivity. Requires an admin session with the database-hosts:read ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Connection successful',
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
      '400': { description: 'Missing host ID' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing database-hosts:read ACL permission' },
      '404': { description: 'Database host not found' },
      '502': { description: 'Connection to the database host failed' },
    },
  },
});

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
