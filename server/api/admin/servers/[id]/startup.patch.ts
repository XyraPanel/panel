import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'
import { createWingsClient } from '~~/server/utils/wings/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const body = await readBody(event)
  const { startup, dockerImage, environment } = body

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  if (startup !== undefined) {
    db.update(tables.servers)
      .set({ startup })
      .where(eq(tables.servers.id, serverId))
      .run()
  }

  if (dockerImage !== undefined) {
    db.update(tables.servers)
      .set({ dockerImage })
      .where(eq(tables.servers.id, serverId))
      .run()
  }

  if (environment !== undefined) {

    db.delete(tables.serverStartupEnv)
      .where(eq(tables.serverStartupEnv.serverId, serverId))
      .run()

    const now = new Date()
    for (const [key, value] of Object.entries(environment)) {
      const id = `env_${serverId}_${key}_${Date.now()}`
      db.insert(tables.serverStartupEnv)
        .values({
          id,
          serverId,
          key,
          value: String(value),
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  }

  if (server.nodeId) {
    const [node] = db.select()
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, server.nodeId))
      .limit(1)
      .all()

    if (node) {
      try {
        const wingsClient = createWingsClient({
          fqdn: node.fqdn,
          scheme: node.scheme,
          daemonListen: node.daemonListen,
          tokenId: node.tokenIdentifier,
          tokenSecret: node.tokenSecret,
        })

        await fetch(`${wingsClient}/sync`, {
          method: 'POST',
        })
      } catch (error) {
        console.error('Failed to sync startup configuration with Wings:', error)

      }
    }
  }

  return {
    success: true,
    message: 'Startup configuration updated successfully',
  }
})
