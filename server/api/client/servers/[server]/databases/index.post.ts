import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { randomBytes } from 'crypto'
import { invalidateServerCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.create'],
  })

  const body = await readBody(event)
  const { database, remote } = body

  if (!database) {
    throw createError({
      statusCode: 400,
      message: 'Database name is required',
    })
  }

  const db = useDrizzle()
  const existingDatabases = db.select()
    .from(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, server.id))
    .all()

  if (server.databaseLimit && existingDatabases.length >= server.databaseLimit) {
    throw createError({
      statusCode: 403,
      message: 'Database limit reached',
    })
  }

  const [databaseHost] = db.select()
    .from(tables.databaseHosts)
    .limit(1)
    .all()

  if (!databaseHost) {
    throw createError({
      statusCode: 500,
      message: 'No database host configured',
    })
  }

  const databaseId = `db_${Date.now()}`
  const username = `s${server.id.substring(0, 8)}_${database}`.substring(0, 32)
  const password = randomBytes(16).toString('hex')
  const now = new Date()

  try {
    db.insert(tables.serverDatabases)
      .values({
        id: databaseId,
        serverId: server.id,
        databaseHostId: databaseHost.id,
        name: `s${server.id}_${database}`,
        username,
        password,
        remote: remote || '%',
        maxConnections: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

    await recordAuditEventFromRequest(event, {
      actor: accountContext.user.id,
      actorType: 'user',
      action: 'server.database.create',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        databaseId,
        databaseName: `s${server.id}_${database}`,
        username,
        remote: remote || '%',
      },
    })

    return {
      object: 'server_database',
      attributes: {
        id: databaseId,
        host_id: databaseHost.id,
        name: `s${server.id}_${database}`,
        username,
        remote: remote || '%',
        max_connections: 0,
        created_at: now,
        updated_at: now,
      },
      meta: {
        password,
      },
    }
  } catch (error) {
    console.error('Failed to create database:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create database',
    })
  }
})
