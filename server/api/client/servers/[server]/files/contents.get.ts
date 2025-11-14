import { getServerSession } from '#auth'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

export default defineEventHandler(async (event) => {
  await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const query = getQuery(event)
  const file = query.file as string

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  if (!file) {
    throw createError({
      statusCode: 400,
      message: 'File path is required',
    })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverId)
    const content = await client.getFileContents(server.uuid as string, file)

    return content
  } catch (error) {
    console.error('Failed to read file from Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to read file',
    })
  }
})
