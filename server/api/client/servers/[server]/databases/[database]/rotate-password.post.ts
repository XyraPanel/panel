import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { randomBytes } from 'node:crypto';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';
import { rotateUserPassword } from '#server/utils/database-provisioner';

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
});
