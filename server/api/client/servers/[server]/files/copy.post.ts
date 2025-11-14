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
  const { location } = body

  if (!location) {
    throw createError({
      statusCode: 400,
      message: 'File location is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.copyFile(server.uuid, location)

    return {
      success: true,
      message: 'File copied successfully',
    }
  } catch (error) {
    console.error('Failed to copy file on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to copy file',
    })
  }
})
