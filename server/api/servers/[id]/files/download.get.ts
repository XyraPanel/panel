import { createError, getQuery, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteGetFileDownloadUrl } from '~~/server/utils/wings/registry'

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.download'],
  })

  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : ''

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'File path is required',
    })
  }

  try {
    const result = await remoteGetFileDownloadUrl(context.server.uuid, file, context.node?.id)

    return {
      success: true,
      data: result,
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to generate download URL',
      cause: error,
    })
  }
})
