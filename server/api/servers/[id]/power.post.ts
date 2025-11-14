import { createError } from 'h3'
import { getServerSession } from '#auth'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import type { PowerActionRequest } from '#shared/types/server-console'

export default defineEventHandler(async (event) => {
  const identifier = event.context.params?.id
  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<PowerActionRequest>(event)

  if (!body.action || !['start', 'stop', 'restart', 'kill'].includes(body.action)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Invalid power action. Must be one of: start, stop, restart, kill',
    })
  }

  if (!server.nodeId) {
    throw createError({ statusCode: 500, statusMessage: 'Server has no assigned node' })
  }

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.sendPowerAction(server.uuid, body.action as 'start' | 'stop' | 'restart' | 'kill')

    return {
      success: true,
      message: `Power action '${body.action}' sent successfully`,
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to send power action',
    })
  }
})
