import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const locationId = getRouterParam(event, 'id')
  if (!locationId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Location ID is required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Location not found' })
  }

  const nodesCount = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.locationId, locationId))
    .all()

  if (nodesCount.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Cannot delete location with ${nodesCount.length} assigned node(s)`,
    })
  }

  await db.delete(tables.locations).where(eq(tables.locations.id, locationId))

  return { success: true }
})
