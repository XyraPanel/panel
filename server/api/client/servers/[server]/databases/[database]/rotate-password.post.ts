import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { randomBytes } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const databaseId = getRouterParam(event, 'database')

  if (!serverId || !databaseId) {
    throw createError({
      statusCode: 400,
      message: 'Server and database identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  const db = useDrizzle()
  const [database] = db.select()
    .from(tables.serverDatabases)
    .where(
      and(
        eq(tables.serverDatabases.serverId, server.id),
        eq(tables.serverDatabases.id, databaseId)
      )
    )
    .limit(1)
    .all()

  if (!database) {
    throw createError({
      statusCode: 404,
      message: 'Database not found',
    })
  }

  const newPassword = randomBytes(16).toString('hex')

  db.update(tables.serverDatabases)
    .set({
      password: newPassword,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverDatabases.id, databaseId))
    .run()

  return {
    object: 'server_database',
    attributes: {
      id: database.id,
      name: database.name,
      username: database.username,
    },
    meta: {
      password: newPassword,
    },
  }
})
