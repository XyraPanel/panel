import { type H3Event } from 'h3'
import { remoteListServerDirectory } from '#server/utils/wings/registry'
import { debugError } from '#server/utils/logger'
import { requireAccountUser } from '#server/utils/security'
import { getServerWithAccess } from '#server/utils/server-helpers'
import { requireServerPermission } from '#server/utils/permission-middleware'
import { recordServerActivity } from '#server/utils/server-activity'

export default defineEventHandler(async (event: H3Event) => {
  const identifier = getRouterParam(event, 'id')
  if (!identifier) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing server identifier',
    })
  }

  const { user, session } = await requireAccountUser(event)
  const { server } = await getServerWithAccess(identifier, session)

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.files.read'],
  })

  const query = getQuery(event)
  const directory = typeof query.directory === 'string' ? query.directory : '/'

  try {
    const nodeId = server.nodeId ? String(server.nodeId) : undefined
    const listing = await remoteListServerDirectory(server.uuid, directory, nodeId)

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.files.listed',
      server: { id: server.id, uuid: server.uuid },
      metadata: { directory, nodeId },
    })

    return { data: listing }
  }
  catch (error) {
    let errorMessage = 'Unable to list server directory.'
    let statusCode = 502
    let errorData: Record<string, unknown> = {}

    if (error && typeof error === 'object' && 'statusCode' in error) {
      const h3Error = error as { statusCode: number; message?: string; data?: unknown }
      statusCode = h3Error.statusCode
      errorMessage = h3Error.message || errorMessage
      if (h3Error.data && typeof h3Error.data === 'object') {
        errorData = h3Error.data as Record<string, unknown>
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    debugError('[Files List] Failed to list directory:', {
      serverUuid: server.uuid,
      serverStatus: server.status,
      directory,
      error: errorMessage,
      statusCode,
    })

    if (server.status === 'installing') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Server not ready',
        message: 'The server is currently installing. Please wait for installation to complete.',
        data: {
          serverUuid: server.uuid,
          status: server.status,
          wingsError: errorMessage,
        },
      })
    }

    if (server.status === 'install_failed' && (errorMessage.includes('directory') || errorMessage.includes('not found') || statusCode === 404)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Server directory not found',
        message: 'The server directory does not exist. This usually happens when installation fails. Please try installing the server again using the "Install on Wings" button.',
        data: {
          serverUuid: server.uuid,
          status: server.status,
          wingsError: errorMessage,
        },
      })
    }

    if (statusCode === 403) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Wings Authentication Failed',
        message: 'Unable to authenticate with Wings daemon. The Wings node token may be incorrect. Please update your Wings configuration with the token from Admin → Wings → Nodes → [Your Node] → Configuration.',
        data: {
          serverUuid: server.uuid,
          directory,
          nodeId: server.nodeId,
          wingsError: errorMessage,
          ...errorData,
        },
        cause: error,
      })
    }

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode,
      statusMessage: 'Wings request failed',
      message: errorMessage,
      data: {
        serverUuid: server.uuid,
        directory,
        ...errorData,
      },
      cause: error,
    })
  }
})
