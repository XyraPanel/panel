import { getServerWithAccess } from '#server/utils/server-helpers'
import { getWingsClientForServer } from '#server/utils/wings-client'
import { recordServerActivity } from '#server/utils/server-activity'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { requireAccountUser, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { serverCommandSchema } from '#shared/schema/server/operations'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')
  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier required' })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.command'],
    allowOwner: true,
    allowAdmin: true,
  })

  const body = await readValidatedBodyWithLimit(event, serverCommandSchema, BODY_SIZE_LIMITS.SMALL)

  try {
    const { client } = await getWingsClientForServer(server.uuid as string)
    await client.sendCommand(server.uuid as string, body.command)

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.command.executed',
      server: { id: server.id, uuid: server.uuid },
      metadata: { command: body.command },
    })

    return {
      data: {
        success: true,
        message: 'Command sent successfully',
      },
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
