import { serverManager } from '#server/utils/server-manager'
import { WingsConnectionError, WingsAuthError } from '#server/utils/wings-client'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireAccountUser, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security'
import { serverPowerActionSchema } from '#shared/schema/server/operations'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')

  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier required' })
  }

  const accountContext = await requireAccountUser(event)
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.power'],
    allowOwner: true,
    allowAdmin: true,
  })

  const body = await readValidatedBodyWithLimit(event, serverPowerActionSchema, BODY_SIZE_LIMITS.SMALL)

  try {
    await serverManager.powerAction(serverIdentifier, body.action, {
      userId: user.id,
    })

    await recordServerActivity({
      event,
      actorId: user.id,
      action: `server.power.${body.action}`,
      server: { id: server.id, uuid: server.uuid },
      metadata: { action: body.action },
    })

    return {
      data: {
        success: true,
        message: `Power action ${body.action} sent successfully`,
      },
    }
  } catch (error) {
    console.error('Wings power action failed:', error)
    
    if (error instanceof WingsAuthError) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Wings authentication failed',
        data: { error: error.message },
      })
    }
    
    if (error instanceof WingsConnectionError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Wings daemon unavailable',
        data: { error: error.message },
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send power action to Wings',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
