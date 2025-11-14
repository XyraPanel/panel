import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

const VALID_POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const
type PowerAction = typeof VALID_POWER_ACTIONS[number]

interface PowerActionRequest {
  action: PowerAction
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)
  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const serverId = getRouterParam(event, 'id')
  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server ID is required',
    })
  }

  const body = await readBody<PowerActionRequest>(event)

  if (!body.action || !VALID_POWER_ACTIONS.includes(body.action)) {
    throw createError({
      statusCode: 400,
      message: `Invalid power action. Must be one of: ${VALID_POWER_ACTIONS.join(', ')}`,
    })
  }

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

  const isOwner = server.ownerId === user.id
  const isAdmin = user.role === 'admin'

  if (!isOwner && !isAdmin) {

    const [subuser] = await db.select()
      .from(tables.serverSubusers)
      .where(
        and(
          eq(tables.serverSubusers.serverId, serverId),
          eq(tables.serverSubusers.userId, user.id),
        ),
      )
      .limit(1)

    if (!subuser) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to access this server',
      })
    }

    const permissions = JSON.parse(subuser.permissions) as string[]
    const hasPowerPermission = permissions.includes('control.console') || permissions.includes('control.start') || permissions.includes('control.stop') || permissions.includes('control.restart')

    if (!hasPowerPermission) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to control server power',
      })
    }
  }

  if (server.suspended && (body.action === 'start' || body.action === 'restart')) {
    throw createError({
      statusCode: 400,
      message: 'Cannot start or restart a suspended server',
    })
  }

  if (!server.nodeId) {
    throw createError({
      statusCode: 500,
      message: 'Server has no assigned node',
    })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.sendPowerAction(server.uuid, body.action)

    let newStatus = server.status
    if (body.action === 'start') {
      newStatus = 'starting'
    } else if (body.action === 'stop') {
      newStatus = 'stopping'
    } else if (body.action === 'restart') {
      newStatus = 'restarting'
    } else if (body.action === 'kill') {
      newStatus = 'stopping'
    }

    db.update(tables.servers)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, serverId))
      .run()

    return {
      success: true,
      message: `Server power action '${body.action}' initiated`,
    }
  } catch (error) {
    console.error('Wings power action error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to execute power action',
    })
  }
})
