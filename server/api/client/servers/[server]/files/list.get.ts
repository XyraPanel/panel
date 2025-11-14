import { getServerSession } from '#auth'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

export default defineEventHandler(async (event) => {
  await getServerSession(event)
  const serverId = getRouterParam(event, 'server')
  const query = getQuery(event)
  const directory = (query.directory as string) || '/'

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverId)
    const files = await client.listFiles(server.uuid as string, directory)

    return {
      data: files,
    }
  } catch (error) {
    console.error('Failed to list files from Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to list files',
    })
  }
})
