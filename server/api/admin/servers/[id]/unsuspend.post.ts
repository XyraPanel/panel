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

  if (!server.suspended) {
    return {
      success: true,
      message: 'Server is already unsuspended',
    }
  }

  db.update(tables.servers)
    .set({ suspended: false })
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

        await client.updateServer(server.uuid, { suspended: false })
      } catch (error) {
        console.error('Failed to sync unsuspension with Wings:', error)

        db.update(tables.servers)
          .set({ suspended: true })
          .where(eq(tables.servers.id, serverId))
          .run()

        throw createError({
          statusCode: 500,
          message: 'Failed to sync suspension status with node',
        })
      }
    }
  }

  return {
    success: true,
    message: 'Server unsuspended successfully',
  }
})
