import { randomUUID, randomBytes } from 'node:crypto';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { sql } from 'drizzle-orm';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { provisionDatabase } from '#server/utils/database-provisioner';
import { createServerDatabaseSchema } from '#shared/schema/server/operations';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({ status: 400, message: 'Server identifier is required' });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(
    event,
    createServerDatabaseSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const serverDbRows = await db
    .select({ serverDbCount: sql<number>`count(*)` })
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, server.id));

  if (server.databaseLimit && Number(serverDbRows[0]?.serverDbCount ?? 0) >= server.databaseLimit) {
    throw createError({ status: 403, message: 'Server database limit reached' });
  }

  const [databaseHost] = await db.select().from(tables.databaseHosts).limit(1);

  if (!databaseHost) {
    throw createError({ status: 500, message: 'No database host configured' });
  }

  if (databaseHost.maxDatabases && databaseHost.maxDatabases > 0) {
    const hostDbRows = await db
      .select({ hostDbCount: sql<number>`count(*)` })
      .from(tables.serverDatabases)
      .where(eq(tables.serverDatabases.databaseHostId, databaseHost.id));
    if (Number(hostDbRows[0]?.hostDbCount ?? 0) >= databaseHost.maxDatabases) {
      throw createError({
        status: 503,
        message: 'Database host has reached its maximum database limit',
      });
    }
  }

  const databaseId = randomUUID();
  const safeName = body.name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 48);
  const dbName = `s${server.id.substring(0, 8)}_${safeName}`;
  const username = `u${server.id.substring(0, 8)}_${safeName}`.substring(0, 32);
  const password = randomBytes(24).toString('hex');
  const remote = body.remote || '%';
  const now = new Date();

  await provisionDatabase(databaseHost, dbName, username, password, remote);

  await db.insert(tables.serverDatabases).values({
    id: databaseId,
    serverId: server.id,
    databaseHostId: databaseHost.id,
    name: dbName,
    username,
    password,
    remote,
    maxConnections: null,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  });

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier });

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.id,
    actorType: 'user',
    action: 'server.database.created',
    targetType: 'server',
    targetId: server.id,
    metadata: { databaseId, databaseName: dbName, username, remote },
  });

  return {
    object: 'server_database',
    attributes: {
      id: databaseId,
      host_id: databaseHost.id,
      name: dbName,
      username,
      remote,
      max_connections: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    meta: { password },
  };
});
