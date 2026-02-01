import { eq } from 'drizzle-orm'
import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const { id: serverId } = event.context.params ?? {}
  if (!serverId || typeof serverId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing server id' })
  }

  const session = await requireAdmin(event)
  
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.SERVERS, ADMIN_ACL_PERMISSIONS.WRITE)

  const body = await readBody(event)
  const action = body.action as string

  if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
    throw createError({ status: 400, statusText: 'Invalid power action' })
  }

  const db = useDrizzle()

  const server = db.select({
    id: tables.servers.id,
    uuid: tables.servers.uuid,
    name: tables.servers.name,
    nodeId: tables.servers.nodeId,
    status: tables.servers.status,
    eggId: tables.servers.eggId,
    allocationId: tables.servers.allocationId,
  })
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .get()

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' })
  }

  if (!server.nodeId) {
    throw createError({ status: 400, statusText: 'Server has no assigned node' })
  }

  if (action === 'start' && (server.status === 'install_failed' || !server.status)) {
    if (!server.eggId) {
      throw createError({
        status: 400,
        statusText: 'Server has no egg assigned. Cannot install server.',
      })
    }

    const { provisionServerOnWings } = await import('#server/utils/server-provisioning')
    
    const allocations = db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, server.id!))
      .all()

    const primaryAllocation = allocations.find(a => a.isPrimary)

    if (!primaryAllocation) {
      throw createError({
        status: 400,
        statusText: 'Server has no primary allocation. Cannot install server.',
      })
    }

    setImmediate(async () => {
      try {
        await provisionServerOnWings({
          serverId: server.id!,
          serverUuid: server.uuid!,
          eggId: server.eggId!,
          nodeId: server.nodeId!,
          allocationId: primaryAllocation.id,
          environment: {},
          startOnCompletion: true,
        })
        console.log(`[Power Action] Successfully installed and started server: ${server.uuid}`)
      } catch (error) {
        console.error(`[Power Action] Failed to install server ${server.uuid}:`, error)
      }
    })

    return {
      data: {
        success: true,
        action: 'install_and_start',
        serverId: server.id,
        serverUuid: server.uuid,
        message: `Server installation has been triggered. The server will start automatically after installation completes.`,
      },
    }
  }

  const node = db.select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, server.nodeId))
    .get()

  if (!node) {
    throw createError({ status: 404, statusText: 'Node not found' })
  }

  try {
    const { getWingsClientForServer } = await import('#server/utils/wings-client')
    const { client } = await getWingsClientForServer(server.uuid)

    await client.sendPowerAction(server.uuid, action as 'start' | 'stop' | 'restart' | 'kill')

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: `admin.server.power.${action}`,
      targetType: 'server',
      targetId: serverId,
      metadata: {
        serverName: server.name,
        serverUuid: server.uuid,
        powerAction: action,
      },
    })

    return {
      data: {
        success: true,
        action,
        serverId: server.id,
        serverUuid: server.uuid,
        message: `Power action '${action}' sent to server ${server.name}`,
      },
    }
  }
  catch (error) {
    const err = error as Error
    throw createError({
      status: 500,
      statusText: `Failed to send power command: ${err.message}`,
    })
  }
})
