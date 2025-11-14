import { getServerSession } from '#auth'
import { getServerWithAccess } from '~~/server/utils/server-helpers'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
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

  const { server } = await getServerWithAccess(serverId, session)

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.deleteFiles(server.uuid, root || '/', files)

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
