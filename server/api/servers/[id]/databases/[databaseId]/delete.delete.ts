import { eq, and } from 'drizzle-orm';
import { useDrizzle } from '#server/utils/drizzle';
import * as tables from '#server/database/schema';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { invalidateServerCaches } from '#server/utils/serversStore';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  const databaseId = getRouterParam(event, 'databaseId');

  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  if (!databaseId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing database identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.delete'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();

  const [database] = await db
    .select()
    .from(tables.serverDatabases)
    .where(
      and(
        eq(tables.serverDatabases.id, databaseId),
        eq(tables.serverDatabases.serverId, server.id),
      ),
    )
    .limit(1);

  if (!database) {
    throw createError({ status: 404, statusText: 'Database not found' });
  }

  try {
    await db.delete(tables.serverDatabases).where(eq(tables.serverDatabases.id, databaseId));

    await invalidateServerCaches({ id: server.id });

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.database.deleted',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        databaseId,
        databaseName: database.name,
      },
    });

    return {
      data: {
        success: true,
        message: 'Database deleted successfully',
      },
    };
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to delete database',
    });
  }
});
