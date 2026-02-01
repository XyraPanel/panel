import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess, getNodeForServer } from '#server/utils/server-helpers'
import { createWingsClient } from '#server/utils/wings/client'
import { useDrizzle, tables, eq } from '#server/utils/drizzle'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const { user, session } = await requireAccountUser(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
  })

  if (server.suspended) {
    throw createError({
      statusCode: 403,
      message: 'Server is suspended',
    })
  }

  const db = useDrizzle()
  db.update(tables.servers)
    .set({
      status: 'installing',
      installedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, server.id))
    .run()

  await Promise.all([
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.reinstalled',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverId: server.id,
        serverUuid: server.uuid,
      },
    }),
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.reinstall.requested',
      server: { id: server.id, uuid: server.uuid },
    }),
  ])

  const node = await getNodeForServer(server.nodeId)

  try {
    const wingsClient = createWingsClient({
      fqdn: node.fqdn,
      scheme: node.scheme,
      daemonListen: node.daemonListen,
      tokenId: node.tokenIdentifier,
      tokenSecret: node.tokenSecret,
    })

    const response = await fetch(`${wingsClient}/servers/${server.uuid}/reinstall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to trigger reinstall')
    }

    return {
      data: {
        success: true,
        message: 'Server reinstall initiated',
      },
    }
  } catch (error) {
    console.error('Failed to trigger reinstall on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to trigger reinstall',
    })
  }
})
