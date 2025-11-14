import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  const dbId = getRouterParam(event, 'dbId')

  if (!serverId || !dbId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const db = useDrizzle()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Server not found' })
  }

  if (server.ownerId !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const database = await db
    .select()
    .from(tables.serverDatabases)
    .where(and(eq(tables.serverDatabases.id, dbId), eq(tables.serverDatabases.serverId, serverId)))
    .get()

  if (!database) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Database not found' })
  }

  await db.delete(tables.serverDatabases).where(eq(tables.serverDatabases.id, dbId))

  return { success: true }
})
