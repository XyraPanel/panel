import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { requirePermission } from '~~/server/utils/permission-middleware'
import { recordServerActivity } from '~~/server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')
  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier required' })
  }

  const { userId } = await requirePermission(event, 'server.command', serverIdentifier)
  const body = await readBody<{ command: string }>(event)

  if (!body.command || body.command.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Command is required' })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverIdentifier)
    await client.sendCommand(server.uuid as string, body.command)

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.command',
      server: { id: server.id as string, uuid: server.uuid as string },
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
