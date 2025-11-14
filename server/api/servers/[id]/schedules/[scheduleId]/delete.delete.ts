import { createError } from 'h3'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  const scheduleId = event.context.params?.scheduleId

  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  if (!scheduleId || typeof scheduleId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing schedule identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const db = useDrizzle()

  const schedule = await db
    .select()
    .from(tables.serverSchedules)
    .where(and(
      eq(tables.serverSchedules.id, scheduleId),
      eq(tables.serverSchedules.serverId, server.id),
    ))
    .get()

  if (!schedule) {
    throw createError({ statusCode: 404, statusMessage: 'Schedule not found' })
  }

  try {
    await db
      .delete(tables.serverSchedules)
      .where(eq(tables.serverSchedules.id, scheduleId))

    return {
      success: true,
      message: 'Schedule deleted successfully',
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to delete schedule',
    })
  }
})
