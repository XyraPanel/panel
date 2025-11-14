import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

interface CommandRequest {
  command: string
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

  const body = await readBody<CommandRequest>(event)

  if (!body.command || typeof body.command !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Command is required',
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
    const hasCommandPermission = permissions.includes('control.console') || permissions.includes('command.send')

    if (!hasCommandPermission) {
      throw createError({
        statusCode: 403,
        message: 'You do not have permission to send commands to this server',
      })
    }
  }

  if (!server.nodeId) {
    throw createError({
      statusCode: 500,
      message: 'Server has no assigned node',
    })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.sendCommand(server.uuid, body.command)

    return {
      success: true,
      message: 'Command sent successfully',
    }
  } catch (error) {
    console.error('Wings command error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to send command',
    })
  }
})
