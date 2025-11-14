import { createError } from 'h3'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  const databaseId = event.context.params?.databaseId

  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  if (!databaseId || typeof databaseId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing database identifier' })
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

  const database = await db
    .select()
    .from(tables.serverDatabases)
    .where(and(
      eq(tables.serverDatabases.id, databaseId),
      eq(tables.serverDatabases.serverId, server.id),
    ))
    .get()

  if (!database) {
    throw createError({ statusCode: 404, statusMessage: 'Database not found' })
  }

  const newPassword = crypto.randomUUID().replace(/-/g, '')

  try {
    await db
      .update(tables.serverDatabases)
      .set({
        password: newPassword,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverDatabases.id, databaseId))

    return {
      success: true,
      data: {
        password: newPassword,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to rotate password',
    })
  }
})
