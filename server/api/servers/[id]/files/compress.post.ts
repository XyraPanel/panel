import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteCompressFiles } from '~~/server/utils/wings/registry'

interface CompressBody {
  root: string
  files: string[]
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.compress'],
  })

  const body = await readBody<CompressBody>(event)

  if (!body.root || !Array.isArray(body.files) || body.files.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Root path and files array are required',
    })
  }

  try {
    const result = await remoteCompressFiles(context.server.uuid, body.root, body.files, context.node?.id)

    return {
      success: true,
      data: {
        file: result.file,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to compress files',
    })
  }
})
