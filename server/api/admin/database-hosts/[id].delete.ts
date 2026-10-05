import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Database Hosts'],
    summary: 'Delete a database host',
    description:
      'Permanently deletes a database host. Fails if any server databases are still provisioned on it. Requires an admin session with the database-hosts:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Database host deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    deletedId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing host ID, or host still has databases assigned' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing database-hosts:write ACL permission' },
      '404': { description: 'Database host not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const hostId = getRouterParam(event, 'id');
  if (!hostId) {
    throw createError({ status: 400, message: 'Host ID is required' });
  }

  try {
    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.databaseHosts)
      .where(eq(tables.databaseHosts.id, hostId))
      .limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Database host not found' });
    }

    const databasesCount = await db
      .select({ id: tables.serverDatabases.id })
      .from(tables.serverDatabases)
      .where(eq(tables.serverDatabases.databaseHostId, hostId));

    if (databasesCount.length > 0) {
      throw createError({
        status: 400,
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
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Database Host Delete] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to delete database host',
    });
  }
});
