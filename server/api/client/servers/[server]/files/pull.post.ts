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
  const { url, directory, filename, use_header } = body

  if (!url) {
    throw createError({
      statusCode: 400,
      message: 'URL is required',
    })
  }

  const { server } = await getServerWithAccess(serverId, session)

  try {
    const { client } = await getWingsClientForServer(server.uuid)
    await client.pullFile(server.uuid, url, directory || '/', filename, use_header, true)

    return {
      success: true,
      message: 'File pull initiated',
    }
  } catch (error) {
    console.error('Failed to pull file on Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to pull file from URL',
    })
  }
})
