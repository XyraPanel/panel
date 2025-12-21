import { requirePermission } from '~~/server/utils/permission-middleware'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { recordServerActivity } from '~~/server/utils/server-activity'

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody(event)
  const { root, name } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Folder name is required',
    })
  }

  const { userId } = await requirePermission(event, 'server.files.write', serverId)

  try {
    const { client, server } = await getWingsClientForServer(serverId)
    await client.createDirectory(server.uuid as string, root || '/', name)

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.file.create_folder',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { root: root || '/', name },
    })

    return {
      success: true,
      message: 'Folder created successfully',
    }
  } catch (error) {
    console.error('Failed to create folder on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create folder',
    })
  }
})
