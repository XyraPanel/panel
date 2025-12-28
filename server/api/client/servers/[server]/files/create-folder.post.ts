import { createError, readBody, type H3Event } from 'h3'
import { requirePermission } from '~~/server/utils/permission-middleware'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { recordServerActivity } from '~~/server/utils/server-activity'

interface CreateDirectoryBody {
  root?: string
  name?: string
}

export default defineEventHandler(async (event: H3Event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const { userId } = await requirePermission(event, 'file.create', serverId)

  const body = await readBody<CreateDirectoryBody>(event)
  const name = body.name?.trim()
  const root = typeof body.root === 'string' && body.root.length > 0 ? body.root : '/'

  if (!name) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Directory name is required',
    })
  }

  try {
    const { client, server } = await getWingsClientForServer(serverId)

    await client.createDirectory(server.uuid as string, root, name)

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.directory.create',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { directory: root, name },
    })

    return {
      success: true,
      data: {
        name,
        root,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to create directory',
      cause: error,
    })
  }
})
