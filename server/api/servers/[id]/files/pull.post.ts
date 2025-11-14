import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remotePullFile } from '~~/server/utils/wings/registry'

interface PullBody {
  url?: string
  directory?: string
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.pull'],
  })

  const body = await readBody<PullBody>(event)
  const url = body.url?.trim()
  const directory = typeof body.directory === 'string' && body.directory.length > 0 ? body.directory : '/'

  if (!url) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'A source URL is required',
    })
  }

  try {
    await remotePullFile(context.server.uuid, url, directory, context.node?.id)

    return {
      success: true,
      data: {
        url,
        directory,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to pull remote file',
      cause: error,
    })
  }
})
