import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { getServerSession } from '~~/server/utils/session'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '~~/server/utils/security'
import { createServerDatabaseSchema } from '#shared/schema/server/operations'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
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

  const body = await readValidatedBodyWithLimit(
    event,
    createServerDatabaseSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  const db = useDrizzle()

  const host = await db
    .select()
    .from(tables.databaseHosts)
    .limit(1)
    .get()

  if (!host) {
    throw createError({ statusCode: 500, statusMessage: 'No database host available' })
  }

  const databaseId = randomUUID()
  const dbName = `s${server.id.substring(0, 8)}_${body.name}`.replace(/[^a-zA-Z0-9_]/g, '_')
  const dbUsername = `u${server.id.substring(0, 8)}_${body.name}`.substring(0, 16).replace(/[^a-zA-Z0-9_]/g, '_')
  const dbPassword = randomUUID().replace(/-/g, '')

  try {

    await db.insert(tables.serverDatabases).values({
      id: databaseId,
      serverId: server.id,
      databaseHostId: host.id,
      name: dbName,
      username: dbUsername,
      password: dbPassword,
      remote: body.remote,
      maxConnections: null,
      status: 'ready',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return {
      success: true,
      data: {
        id: databaseId,
        name: dbName,
        username: dbUsername,
        password: dbPassword,
        host: {
          hostname: host.hostname,
          port: host.port,
        },
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to create database',
    })
  }
})
