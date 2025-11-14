import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

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

  if (server.suspended) {
    return {
      success: true,
      message: 'Server is already suspended',
    }
  }

  db.update(tables.servers)
    .set({ suspended: true })
    .where(eq(tables.servers.id, serverId))
    .run()

  if (server.nodeId) {
    const [node] = db.select()
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, server.nodeId))
      .limit(1)
      .all()

    if (node) {
      try {
        const { client } = await getWingsClientForServer(server.uuid)

        await client.sendPowerAction(server.uuid, 'kill')
      }
      catch (error) {
        const err = error as Error

        db.update(tables.servers)
          .set({ suspended: false })
          .where(eq(tables.servers.id, serverId))
          .run()

        throw createError({
          statusCode: 500,
          statusMessage: `Failed to suspend server: ${err.message}`,
        })
      }
    }
  }

  return {
    success: true,
    message: 'Server suspended successfully',
  }
})
