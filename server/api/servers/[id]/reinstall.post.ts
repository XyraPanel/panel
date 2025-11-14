import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { recordAuditEvent } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Server ID required' })
  }

  const db = useDrizzle()

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverId))
    .get()

  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to reinstall this server'
    })
  }

  if (server.suspended) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot reinstall a suspended server'
    })
  }

  try {
    const { getWingsClientForServer } = await import('../../../utils/wings-client')
    const { client } = await getWingsClientForServer(serverId)
    await client.reinstallServer(serverId)

    db.update(tables.servers)
      .set({
        status: 'installing',
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.uuid, serverId))
      .run()
  }
  catch (error) {
    console.error('Wings reinstall failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to trigger reinstall on Wings',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }

  await recordAuditEvent({
    actor: user.email || 'unknown',
    actorType: 'user',
    action: 'server.reinstall',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      serverName: server.name,
      userId: user.id,
    },
  })

  return {
    success: true,
    message: 'Server reinstallation has been queued',
  }
})
