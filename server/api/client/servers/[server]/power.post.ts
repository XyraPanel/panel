import { serverManager } from '~~/server/utils/server-manager'
import { WingsConnectionError, WingsAuthError } from '~~/server/utils/wings-client'
import { requireServerPermission } from '~~/server/utils/permission-middleware'
import { recordServerActivity } from '~~/server/utils/server-activity'
import { findServerByIdentifier } from '~~/server/utils/serversStore'

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server')

  if (!serverIdentifier) {
    throw createError({ statusCode: 400, statusMessage: 'Server identifier required' })
  }

  const { userId } = await requireServerPermission(event, {
    serverId: serverIdentifier,
    requiredPermissions: ['server.power'],
  })

  const body = await readBody<{ action: 'start' | 'stop' | 'restart' | 'kill' }>(event)

  if (!body.action) {
    throw createError({ statusCode: 400, statusMessage: 'Action is required' })
  }

  const validActions = ['start', 'stop', 'restart', 'kill']
  if (!validActions.includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
  }

  try {
    await serverManager.powerAction(serverIdentifier, body.action, {
      userId,
    })

    const server = await findServerByIdentifier(serverIdentifier)

    if (server) {
      await recordServerActivity({
        event,
        actorId: userId,
        action: `server.power.${body.action}`,
        server: { id: server.id as string, uuid: server.uuid as string },
        metadata: { action: body.action },
      })
    }
    else {
      console.warn('[Server Activity] Unable to find server for power event logging', { serverIdentifier })
    }

    return {
      success: true,
      message: `Power action ${body.action} sent successfully`,
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
