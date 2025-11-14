import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { UpdateLocationPayload } from '#shared/types/admin-locations'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const locationId = getRouterParam(event, 'id')
  if (!locationId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Location ID is required' })
  }

  const body = await readBody<UpdateLocationPayload>(event)
  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Location not found' })
  }

  const updates: Partial<typeof tables.locations.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (body.short !== undefined) updates.short = body.short
  if (body.long !== undefined) updates.long = body.long

  await db
    .update(tables.locations)
    .set(updates)
    .where(eq(tables.locations.id, locationId))

  const updated = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .get()

  return {
    data: {
      id: updated!.id,
      short: updated!.short,
      long: updated!.long,
      createdAt: new Date(updated!.createdAt).toISOString(),
      updatedAt: new Date(updated!.updatedAt).toISOString(),
    },
  }
})
