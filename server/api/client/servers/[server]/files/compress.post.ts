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

  const { userId } = await requirePermission(event, 'server.files.compress', serverId)

  try {
    const { client, server } = await getWingsClientForServer(serverId)
    const result = await client.compressFiles(server.uuid as string, root || '/', files) as { archive?: string } | undefined

    await recordServerActivity({
      event,
      actorId: userId,
      action: 'server.file.compress',
      server: { id: server.id as string, uuid: server.uuid as string },
      metadata: {
        root: root || '/',
        files,
        archive: typeof result?.archive === 'string' ? result.archive : undefined,
      },
    })

    return {
      success: true,
      message: 'Files compressed successfully',
      data: result,
    }
  } catch (error) {
    console.error('Failed to compress files on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to compress files',
    })
  }
})
