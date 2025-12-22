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
  const { root, files } = body

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Files array is required',
    })
  }

  const { userId } = await requirePermission(event, 'server.files.delete', serverId)

  try {
    const { client, server } = await getWingsClientForServer(serverId)
    await client.deleteFiles(server.uuid as string, root || '/', files)

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.file.delete',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: { root: root || '/', files },
    })

    return {
      success: true,
      message: 'Files deleted successfully',
    }
  } catch (error) {
    console.error('Failed to delete files on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to delete files',
    })
  }
})
