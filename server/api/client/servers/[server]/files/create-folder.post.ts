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
  const { root, name } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Folder name is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.createDirectory(server.uuid, root || '/', name)

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
