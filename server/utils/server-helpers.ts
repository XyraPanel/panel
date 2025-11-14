import type { Session } from 'next-auth'
import { useDrizzle, tables, eq } from './drizzle'
import { buildCacheKey, withCache } from './cache'

const NODE_CACHE_TTL = 30

export async function getServerWithAccess(identifier: string, session: Session | null) {
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDrizzle()

  const [user] = db.select()
    .from(tables.users)
    .where(eq(tables.users.email, session.user.email))
    .limit(1)
    .all()

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User not found',
    })
  }

  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.identifier, identifier))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  if (server.ownerId !== user.id) {

    const subusers = db.select()
      .from(tables.serverSubusers)
      .where(eq(tables.serverSubusers.serverId, server.id))
      .all()

    const [subuser] = subusers.filter(su => su.userId === user.id)

    if (!subuser) {
      throw createError({
        statusCode: 403,
        message: 'You do not have access to this server',
      })
    }
  }

  return { server, user }
}

export async function getNodeForServer(nodeId: string | null) {
  if (!nodeId) {
    throw createError({
      statusCode: 400,
      message: 'Server has no node assigned',
    })
  }

  const cacheKey = buildCacheKey('node', nodeId)

  const node = await withCache(cacheKey, async () => {
    const db = useDrizzle()
    const rows = db.select()
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, nodeId))
      .limit(1)
      .all()

    return rows[0] ?? null
  }, { ttl: NODE_CACHE_TTL })

  if (!node) {
    throw createError({
      statusCode: 404,
      message: 'Node not found',
    })
  }

  return node
}
