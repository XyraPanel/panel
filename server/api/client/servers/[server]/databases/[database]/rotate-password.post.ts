import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
import { randomBytes } from 'crypto'
import { invalidateServerCaches } from '#server/utils/serversStore'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAccountUser } from '#server/utils/security'

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')
  const databaseId = getRouterParam(event, 'database')

  if (!serverId || !databaseId) {
    throw createError({
      statusCode: 400,
      message: 'Server and database identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.update'],
  })

  const db = useDrizzle()
  const [database] = db.select()
    .from(tables.serverDatabases)
    .where(
      and(
        eq(tables.serverDatabases.serverId, server.id),
        eq(tables.serverDatabases.id, databaseId)
      )
    )
    .limit(1)
    .all()

  if (!database) {
    throw createError({
      statusCode: 404,
      message: 'Database not found',
    })
  }

  const newPassword = randomBytes(16).toString('hex')

  db.update(tables.serverDatabases)
    .set({ password: newPassword })
    .where(eq(tables.serverDatabases.id, databaseId))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.email || accountContext.user.id,
    actorType: 'user',
    action: 'server.database.password_rotated',
    targetType: 'database',
    targetId: databaseId,
    metadata: {
      serverId: server.id,
      databaseName: database?.name,
    },
  })

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    object: 'server_database',
    attributes: {
      id: database.id,
      name: database.name,
      username: database.username,
    },
    meta: {
      password: newPassword,
    },
  }
})
