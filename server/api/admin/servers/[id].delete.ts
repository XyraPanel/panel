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

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

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

  if (server.nodeId && !force) {
    try {
      const { client } = await getWingsClientForServer(server.uuid)
      await client.deleteServer(server.uuid)
    } catch (error) {
      console.error('Failed to delete server from Wings:', error)
      if (!force) {
        throw createError({
          statusCode: 500,
          message: 'Failed to delete server from node. Use force=true to delete anyway.',
        })
      }
    }
  }

  db.delete(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .run()

  db.delete(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, serverId))
    .run()

  db.delete(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, serverId))
    .run()

  db.delete(tables.serverSchedules)
    .where(eq(tables.serverSchedules.serverId, serverId))
    .run()

  db.delete(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, serverId))
    .run()

  db.delete(tables.serverSubusers)
    .where(eq(tables.serverSubusers.serverId, serverId))
    .run()

  db.delete(tables.serverBackups)
    .where(eq(tables.serverBackups.serverId, serverId))
    .run()

  db.delete(tables.mountServer)
    .where(eq(tables.mountServer.serverId, serverId))
    .run()

  db.delete(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .run()

  return {
    success: true,
    message: 'Server deleted successfully',
  }
})
