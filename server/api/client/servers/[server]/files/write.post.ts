import { getServerSession } from '#auth'
import { getWingsClientForServer } from '~~/server/utils/wings-client'

export default defineEventHandler(async (event) => {
  await getServerSession(event)
  const serverId = getRouterParam(event, 'server')

  if (!serverId) {
    throw createError({
      statusCode: 400,
      message: 'Server identifier is required',
    })
  }

  const body = await readBody<{ file: string; content: string }>(event)
  const { file, content } = body

  if (!file || !content) {
    throw createError({
      statusCode: 400,
      message: 'File path and content are required',
    })
  }

  try {

    const { client, server } = await getWingsClientForServer(serverId)
    await client.writeFileContents(server.uuid as string, file, content)

    return {
      success: true,
      message: 'Files written successfully',
    }
  } catch (error) {
    console.error('Failed to write files to Wings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to write files',
    })
  }
})
