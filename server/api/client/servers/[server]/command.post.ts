import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const serverIdentifier = getRouterParam(event, 'server')
  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier required' })
  }

  const body = await readBody<{ command: string }>(event)

  if (!body.command || body.command.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Command is required' })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverIdentifier)
    await client.sendCommand(server.uuid as string, body.command)

    await recordAuditEvent({
      actor: user.email || 'unknown',
      actorType: 'user',
      action: 'server.command',
      targetType: 'server',
      targetId: serverIdentifier,
      metadata: { command: body.command },
    })

    return {
      success: true,
      message: 'Command sent successfully',
    }
  } catch (error) {
    console.error('Wings command failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send command to Wings',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
