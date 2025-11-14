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

  const location = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .get()

  if (!location) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Location not found' })
  }

  return {
    data: {
      id: location.id,
      short: location.short,
      long: location.long,
      createdAt: new Date(location.createdAt).toISOString(),
      updatedAt: new Date(location.updatedAt).toISOString(),
    },
  }
})
