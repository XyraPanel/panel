import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateLocationPayload } from '#shared/types/admin-locations'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<CreateLocationPayload>(event)

  if (!body.short) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Short code is required' })
  }

  const db = useDrizzle()
  const now = new Date()

  const newLocation = {
    id: randomUUID(),
    short: body.short,
    long: body.long || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.locations).values(newLocation)

  return {
    data: {
      id: newLocation.id,
      short: newLocation.short,
      long: newLocation.long,
      createdAt: newLocation.createdAt.toISOString(),
      updatedAt: newLocation.updatedAt.toISOString(),
    },
  }
})
