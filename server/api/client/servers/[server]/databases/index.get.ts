import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerDatabases } from '#server/utils/databases';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.read'],
  });

  const databases = await listServerDatabases(server.id);

  const db = useDrizzle();
  const [databaseHost] = await db
    .select({ id: tables.databaseHosts.id })
    .from(tables.databaseHosts)
    .limit(1);

  return {
    object: 'list',
    hostAvailable: Boolean(databaseHost),
    data: databases.map((database) => ({
      object: 'server_database',
      attributes: {
        id: database.id,
        host_id: database.databaseHostId,
        name: database.name,
        username: database.username,
        remote: database.remote,
        max_connections: database.maxConnections,
        created_at: database.createdAt,
        updated_at: database.updatedAt,
      },
    })),
  };
});
