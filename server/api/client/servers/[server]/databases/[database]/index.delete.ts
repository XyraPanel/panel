import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { deprovisionDatabase } from '#server/utils/database-provisioner';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Databases'],
    summary: 'Delete a database',
    description:
      'Deprovisions a server database and removes its record. Requires the server.database.delete permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
      { name: 'database', in: 'path', required: true, schema: { type: 'string' }, description: 'Database ID' },
    ],
    responses: {
      '200': {
        description: 'Database deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      '400': { description: 'Missing server or database identifier' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.database.delete permission' },
      '404': { description: 'Server or database not found' },
      '500': { description: 'Failed to delete database' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');
  const databaseId = getRouterParam(event, 'database');

  if (!serverId || !databaseId) {
    throw createError({
      status: 400,
      message: 'Server and database identifiers are required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.delete'],
  });

  try {
    const db = useDrizzle();
    const [database] = await db
      .select()
      .from(tables.serverDatabases)
      .where(
        and(
          eq(tables.serverDatabases.serverId, server.id),
          eq(tables.serverDatabases.id, databaseId),
        ),
      )
      .limit(1);

    if (!database) {
      throw createError({
        status: 404,
        message: 'Database not found',
      });
    }

    const [host] = await db
      .select()
      .from(tables.databaseHosts)
      .where(eq(tables.databaseHosts.id, database.databaseHostId))
      .limit(1);

    if (host) {
      await deprovisionDatabase(host, database.name, database.username, database.remote);
    }

    await db.delete(tables.serverDatabases).where(eq(tables.serverDatabases.id, databaseId));

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.email || accountContext.user.id,
      actorType: 'user',
      action: 'server.database.deleted',
      targetType: 'database',
      targetId: databaseId,
      metadata: {
        serverId: server.id,
        databaseName: database?.name,
      },
    });

    await invalidateServerCaches({
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
    });

    return {
      success: true,
      message: 'Database deleted successfully',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Database Delete] Failed for server:', serverId, 'database:', databaseId, error);
    throw createError({
      status: 500,
      message: 'Failed to delete database',
    });
  }
});
