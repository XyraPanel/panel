import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { randomBytes } from 'node:crypto';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { rotateUserPassword } from '#server/utils/database-provisioner';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Databases'],
    summary: 'Rotate database password',
    description:
      'Generates a new password for a server database and updates it at the database host. Requires the server.database.update permission.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID or identifier' },
      { name: 'database', in: 'path', required: true, schema: { type: 'string' }, description: 'Database ID' },
    ],
    responses: {
      '200': {
        description: 'Password rotated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                object: { type: 'string', enum: ['server_database'] },
                attributes: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    username: { type: 'string' },
                  },
                },
                meta: {
                  type: 'object',
                  properties: {
                    password: { type: 'string', description: 'The new plaintext password' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing server or database identifier' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.database.update permission' },
      '404': { description: 'Server or database not found' },
      '500': { description: 'Database host not found, or internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
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
    requiredPermissions: ['server.database.update'],
  });

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

  const newPassword = randomBytes(24).toString('hex');

  const [host] = await db
    .select()
    .from(tables.databaseHosts)
    .where(eq(tables.databaseHosts.id, database.databaseHostId))
    .limit(1);

  if (!host) {
    throw createError({ status: 500, message: 'Database host not found' });
  }

  await rotateUserPassword(host, database.username, database.remote, newPassword);

  await db
    .update(tables.serverDatabases)
    .set({ password: newPassword, updatedAt: new Date().toISOString() })
    .where(eq(tables.serverDatabases.id, databaseId));

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.email || accountContext.user.id,
    actorType: 'user',
    action: 'server.database.password_rotated',
    targetType: 'database',
    targetId: databaseId,
    metadata: {
      serverId: server.id,
      databaseName: database?.name,
    },
  });

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier });

  return {
    object: 'server_database',
    attributes: {
      id: database.id,
      name: database.name,
      username: database.username,
    },
    meta: {
      password: newPassword,
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
