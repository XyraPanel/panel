import { useDrizzle, tables, eq, or } from '#server/utils/drizzle';
import { buildCacheKey, withCache } from '#server/utils/cache';
import type { getServerSession } from '#server/utils/session';
import { getSessionUser } from '#server/utils/session';

const NODE_CACHE_TTL = 30;

export async function getServerWithAccess(
  identifier: string,
  session: Awaited<ReturnType<typeof getServerSession>> | null,
) {
  const sessionUser = getSessionUser(session);
  if (!sessionUser?.id) {
    throw createError({
      status: 401,
      message: 'Unauthorized',
    });
  }

  const db = useDrizzle();

  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, sessionUser.id))
    .limit(1);

  if (!user) {
    throw createError({
      status: 401,
      message: 'User not found',
    });
  }

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(
      or(
        eq(tables.servers.identifier, identifier),
        eq(tables.servers.uuid, identifier),
        eq(tables.servers.id, identifier),
      ),
    )
    .limit(1);

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  if (server.ownerId !== user.id && user.role !== 'admin') {
    const subusers = await db
      .select()
      .from(tables.serverSubusers)
      .where(eq(tables.serverSubusers.serverId, server.id));

    const [subuser] = subusers.filter((su) => su.userId === user.id);

    if (!subuser) {
      throw createError({
        status: 403,
        message: 'You do not have access to this server',
      });
    }
  }

  return { server, user };
}

export async function getNodeForServer(nodeId: string | null) {
  if (!nodeId) {
    throw createError({
      status: 400,
      message: 'Server has no node assigned',
    });
  }

  const cacheKey = buildCacheKey('node', nodeId);

  const node = await withCache(
    cacheKey,
    async () => {
      const db = useDrizzle();
      const rows = await db
        .select()
        .from(tables.wingsNodes)
        .where(eq(tables.wingsNodes.id, nodeId))
        .limit(1);

      return rows[0] ?? null;
    },
    { ttl: NODE_CACHE_TTL },
  );

  if (!node) {
    throw createError({
      status: 404,
      message: 'Node not found',
    });
  }

  return node;
}
