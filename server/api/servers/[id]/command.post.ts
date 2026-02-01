import { getWingsClientForServer } from '#server/utils/wings-client'
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS, requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'
import { serverCommandSchema } from '#shared/schema/server/operations'

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const accountContext = await requireAccountUser(event)
  const { user, session } = accountContext

  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.command'],
  })

  const body = await readValidatedBodyWithLimit(
    event,
    serverCommandSchema,
    BODY_SIZE_LIMITS.SMALL,
  )

  if (!server.nodeId) {
    throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.sendCommand(server.uuid, body.command)

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.command.sent',
      server: { id: server.id, uuid: server.uuid },
      metadata: { command: body.command },
    })

    return {
      data: {
        success: true,
        message: 'Command sent successfully',
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to send command',
    })
  }
})
