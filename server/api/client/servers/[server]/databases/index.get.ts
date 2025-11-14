import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const databases = db.select()
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, server.id))
    .all()

  return {
    object: 'list',
    data: databases.map(database => ({
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
  }
})
