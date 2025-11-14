import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteDeleteFiles } from '~~/server/utils/wings/registry'

interface DeleteFilesBody {
  root?: string
  files?: string[]
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.delete'],
  })

  const body = await readBody<DeleteFilesBody>(event)
  const root = typeof body.root === 'string' && body.root.length > 0 ? body.root : '/'
  const files = Array.isArray(body.files) ? body.files : []

  if (files.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'At least one file path is required',
    })
  }

  try {
    await remoteDeleteFiles(context.server.uuid, root, files, context.node?.id ?? undefined)

    return {
      success: true,
      data: {
        deleted: files,
        root,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to delete files',
      cause: error,
    })
  }
})
