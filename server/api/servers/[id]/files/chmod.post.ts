import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteChmodFiles } from '~~/server/utils/wings/registry'

interface ChmodInstruction {
  file: string
  mode: string
}

interface ChmodBody {
  root?: string
  files?: ChmodInstruction[]
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.chmod'],
  })

  const body = await readBody<ChmodBody>(event)
  const root = typeof body.root === 'string' && body.root.length > 0 ? body.root : '/'
  const files = Array.isArray(body.files) ? body.files.filter(item => item?.file && item?.mode) : []

  if (files.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'File chmod instructions are required',
    })
  }

  try {
    await remoteChmodFiles(context.server.uuid, root, files, context.node?.id)

    return {
      success: true,
      data: {
        root,
        files,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to change file permissions',
      cause: error,
    })
  }
})
