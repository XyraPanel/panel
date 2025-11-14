import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const hostId = getRouterParam(event, 'id')
  if (!hostId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Host ID is required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.databaseHosts)
    .where(eq(tables.databaseHosts.id, hostId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Database host not found' })
  }

  const databasesCount = await db
    .select()
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.databaseHostId, hostId))
    .all()

  if (databasesCount.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Cannot delete host with ${databasesCount.length} database(s)`,
    })
  }

  await db.delete(tables.databaseHosts).where(eq(tables.databaseHosts.id, hostId))

  return { success: true }
})
