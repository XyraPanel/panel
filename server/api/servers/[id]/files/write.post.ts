import { createError, readBody, type H3Event } from 'h3'
import { resolveServerRequest } from '~~/server/utils/http/serverAccess'
import { remoteWriteFile } from '~~/server/utils/wings/registry'

interface WriteFileBody {
  file?: string
  path?: string
  content?: string
  contents?: string
}

export default defineEventHandler(async (event: H3Event) => {
  const context = await resolveServerRequest(event, {
    requiredPermissions: ['file.write'],
  })

  const body = await readBody<WriteFileBody>(event)

  const filePath = typeof body.file === 'string' && body.file.length > 0
    ? body.file
    : typeof body.path === 'string'
      ? body.path
      : ''
  const contents = body.content ?? body.contents

  if (!filePath || contents === undefined) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'File path and content are required',
    })
  }

  try {
    await remoteWriteFile(context.server.uuid, filePath, contents, context.node?.id)

    return {
      success: true,
      message: 'File saved successfully',
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Wings API Error',
      message: error instanceof Error ? error.message : 'Failed to write file',
    })
  }
})
