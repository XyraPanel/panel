import { getServerWithAccess } from '#server/utils/server-helpers'
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle'
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
      status: 400,
      message: 'Server and database identifiers are required',
    })
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.database.delete'],
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
      status: 404,
      message: 'Database not found',
    })
  }

  db.delete(tables.serverDatabases)
    .where(eq(tables.serverDatabases.id, databaseId))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: accountContext.user.email || accountContext.user.id,
    actorType: 'user',
    action: 'server.database.deleted',
    targetType: 'database',
    targetId: databaseId,
    metadata: {
      serverId: server.id,
      databaseName: database?.name,
    },
  })

  await invalidateServerCaches({ id: server.id, uuid: server.uuid, identifier: server.identifier })

  return {
    success: true,
    message: 'Database deleted successfully',
  }
})
