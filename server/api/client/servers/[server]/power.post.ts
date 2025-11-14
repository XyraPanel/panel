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

  const body = await readBody<{ action: 'start' | 'stop' | 'restart' | 'kill' }>(event)

  if (!body.action) {
    throw createError({ statusCode: 400, statusMessage: 'Action is required' })
  }

  const validActions = ['start', 'stop', 'restart', 'kill']
  if (!validActions.includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverIdentifier)
    await client.sendPowerAction(server.uuid as string, body.action)

    await recordAuditEvent({
      actor: user.email || 'unknown',
      actorType: 'user',
      action: `server.power.${body.action}`,
      targetType: 'server',
      targetId: serverIdentifier,
      metadata: { action: body.action },
    })

    return {
      success: true,
      message: `Power action ${body.action} sent successfully`,
    }
  } catch (error) {
    console.error('Wings power action failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send power action to Wings',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
