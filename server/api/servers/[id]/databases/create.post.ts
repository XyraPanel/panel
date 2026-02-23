import { randomUUID, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { createServerDatabaseSchema } from '#shared/schema/server/operations';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { provisionDatabase } from '#server/utils/database-provisioner';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

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

  const [host] = await db.select().from(tables.databaseHosts).limit(1);

  if (!host) {
    throw createError({ status: 500, message: 'No database host configured' });
  }

  if (host.maxDatabases && host.maxDatabases > 0) {
    const hostDbRows = await db
      .select({ hostDbCount: sql<number>`count(*)` })
      .from(tables.serverDatabases)
      .where(eq(tables.serverDatabases.databaseHostId, host.id));
    if (Number(hostDbRows[0]?.hostDbCount ?? 0) >= host.maxDatabases) {
      throw createError({
        status: 503,
        message: 'Database host has reached its maximum database limit',
      });
    }
  }

  const databaseId = randomUUID();
  const safeName = body.name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 48);
  const dbName = `s${server.id.substring(0, 8)}_${safeName}`;
  const dbUsername = `u${server.id.substring(0, 8)}_${safeName}`.substring(0, 32);
  const dbPassword = randomBytes(24).toString('hex');
  const remote = body.remote || '%';
  const now = new Date();

  await provisionDatabase(host, dbName, dbUsername, dbPassword, remote);

  await db.insert(tables.serverDatabases).values({
    id: databaseId,
    serverId: server.id,
    databaseHostId: host.id,
    name: dbName,
    username: dbUsername,
    password: dbPassword,
    remote,
    maxConnections: null,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  });

  await invalidateServerCaches({ id: server.id });

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.database.created',
    server: { id: server.id, uuid: server.uuid },
    metadata: { databaseId, databaseName: dbName, hostId: host.id },
  });

  return {
    data: {
      id: databaseId,
      name: dbName,
      username: dbUsername,
      password: dbPassword,
      host: { hostname: host.hostname, port: host.port },
    },
  };
});
