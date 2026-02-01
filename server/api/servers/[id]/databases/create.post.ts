import { randomUUID } from 'node:crypto'
import { useDrizzle } from '#server/utils/drizzle'
import * as tables from '#server/database/schema'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { createServerDatabaseSchema } from '#shared/schema/server/operations'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'
import { invalidateServerCaches } from '#server/utils/serversStore'

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Missing server identifier' })
  }

  const { user, session } = await requireAccountUser(event)
  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.create'],
    allowOwner: true,
    allowAdmin: true,
  })

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
    throw createError({ status: 500, statusText: 'No database host available' })
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
  }
  catch (error) {
    throw createError({
      status: 500,
      statusText: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to create database',
    })
  }

  await invalidateServerCaches({ id: server.id })

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.database.created',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      databaseId,
      databaseName: dbName,
      hostId: host.id,
    },
  })

  return {
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
})
