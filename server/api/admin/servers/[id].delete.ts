import { createError } from 'h3'
import { requireAdmin } from '~~/server/utils/security'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { requireAdminApiKeyPermission } from '~~/server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '~~/server/utils/admin-acl'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.SERVERS, ADMIN_ACL_PERMISSIONS.WRITE)

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  const db = useDrizzle()
  const [server] = db.select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1)
    .all()

  if (!server) {
    throw createError({
      statusCode: 404,
      message: 'Server not found',
    })
  }

  if (server.nodeId && !force) {
    try {
      const { client } = await getWingsClientForServer(server.uuid)
      await client.deleteServer(server.uuid)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isNotFound = errorMessage.includes('404') || errorMessage.includes('does not exist')
      
      if (isNotFound) {
        console.log(`Server ${server.uuid} does not exist on Wings, continuing with database deletion`)
      } else {
        console.error('Failed to delete server from Wings:', error)
        throw createError({
          statusCode: 409,
          message: 'Failed to delete server from Wings node. The node may be offline or unreachable. Use force=true to delete from panel anyway.',
        })
      }
    }
  } else if (force && server.nodeId) {
    console.log(`Force deleting server ${server.uuid} from panel (skipping Wings node)`)
  }

  db.update(tables.servers)
    .set({ allocationId: null })
    .where(eq(tables.servers.id, serverId))
    .run()

  db.delete(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .run()

  db.delete(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, serverId))
    .run()

  db.delete(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, serverId))
    .run()

  db.delete(tables.serverSchedules)
    .where(eq(tables.serverSchedules.serverId, serverId))
    .run()

  db.delete(tables.serverDatabases)
    .where(eq(tables.serverDatabases.serverId, serverId))
    .run()

  db.delete(tables.serverSubusers)
    .where(eq(tables.serverSubusers.serverId, serverId))
    .run()

  db.delete(tables.serverBackups)
    .where(eq(tables.serverBackups.serverId, serverId))
    .run()

  db.delete(tables.mountServer)
    .where(eq(tables.mountServer.serverId, serverId))
    .run()

  db.delete(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .run()

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.deleted',
    targetType: 'server',
    targetId: serverId,
    metadata: {
      serverName: server.name,
      serverUuid: server.uuid,
      forced: force,
    },
  })

  return {
    success: true,
    message: 'Server deleted successfully',
  }
})
