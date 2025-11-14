import { createError, getQuery, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteGetFileContents } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.read'],
  })

  const query = getQuery(event)
  const filePath = typeof query.file === 'string' ? query.file : ''

  if (!filePath) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'File path is required' })
  }

  try {
    const data = await remoteGetFileContents(context.server.uuid, filePath, context.node?.id ?? undefined)

    return {
      data,
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to fetch file contents',
      cause: error,
    })
  }
})
