import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteCopyFile } from '~~/server/utils/wings/registry'

interface CopyBody {
  location?: string
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.copy', 'file.create'],
    fallbackPermissions: ['file.create'],
  })

  const body = await readBody<CopyBody>(event)
  const location = body.location?.trim()

  if (!location) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'A target location is required to copy the file.',
    })
  }

  try {
    await remoteCopyFile(context.server.uuid, location, context.node?.id)

    return {
      success: true,
      data: {
        location,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to copy file',
      cause: error,
    })
  }
})
